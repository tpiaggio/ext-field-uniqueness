import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { getExtensions } from "firebase-admin/extensions";
import { getFunctions } from "firebase-admin/functions";

import * as md5 from "md5";

enum ChangeType {
  CREATE,
  DELETE,
  UPDATE,
}

const config = {
  location: process.env.LOCATION || "",
  collection: process.env.COLLECTION_PATH || "",
  fieldName: process.env.FIELD_NAME || "",
  hashField: process.env.HASH_FIELD || "",
  auxCollection: process.env.AUX_COLLECTION_PATH || "",
  doBackfill: process.env.DO_BACKFILL || "",
};

const DOCS_PER_BACKFILL = 250;

admin.initializeApp();

exports.fieldUniqueness =  functions.handler.firestore.document.onWrite(
  async (change): Promise<void> => {
    const changeType = getChangeType(change);
    functions.logger.log("Started execution of Field Uniqueness extension");
    try {
      switch (changeType) {
        case ChangeType.CREATE:
          await handleCreateDocument(change.after);
          break;
        case ChangeType.DELETE:
          handleDeleteDocument(change.before);
          break;
        case ChangeType.UPDATE:
          await handleUpdateDocument(change.before, change.after);
          break;
      }
      functions.logger.log("Completed execution of Field Uniqueness extension");
    } catch (err) {
      functions.logger.log("Error executing Field Uniqueness extension", err);
    }
  }
);

const auxCollection = admin.firestore().collection(config.auxCollection);

const extractUniqueField = (snapshot: admin.firestore.DocumentSnapshot): string => {
  const field = snapshot.get(config.fieldName);
  return (config.hashField === "yes") ? md5(field) : field;
};

const getChangeType = (
  change: functions.Change<admin.firestore.DocumentSnapshot>
): ChangeType => {
  if (!change.after.exists) {
    return ChangeType.DELETE;
  }
  if (!change.before.exists) {
    return ChangeType.CREATE;
  }
  return ChangeType.UPDATE;
};

const handleCreateDocument = async (
  snapshot: admin.firestore.DocumentSnapshot,
): Promise<void> => {
  const uniqueField = extractUniqueField(snapshot);
  if (uniqueField) {
    await auxCollection.doc(uniqueField).set({id: snapshot.id, [config.fieldName]: snapshot.get(config.fieldName)});
    functions.logger.log("Document created with unique field");
  } else {
    functions.logger.log("Document created without unique field, no processing is required");
  }
};

const handleDeleteDocument = async (
  snapshot: admin.firestore.DocumentSnapshot,
): Promise<void> => {
  const uniqueField = extractUniqueField(snapshot);
  if (uniqueField) {
    await auxCollection.doc(uniqueField).delete();
    functions.logger.log("Document updated with unique field");
  } else {
    functions.logger.log("Document deleted without unique field, no processing is required");
  }
};

const handleUpdateDocument = async (
  before: admin.firestore.DocumentSnapshot,
  after: admin.firestore.DocumentSnapshot,
): Promise<void> => {
  const uniqueFieldBefore = extractUniqueField(before);
  const uniqueFieldAfter = extractUniqueField(after);
  console.log("handleUpdateDocument", uniqueFieldBefore, uniqueFieldAfter);

  // If previous and updated documents have no unique field, skip.
  if (uniqueFieldBefore === undefined && uniqueFieldAfter === undefined) {
    functions.logger.log("Document updated without unique field, no processing is required");
    return;
  }

  // If unique field from previous and updated documents didn"t change, skip.
  if (uniqueFieldBefore === uniqueFieldAfter) {
    functions.logger.log("Document updated, unique field has not changed, no processing is required");
    return;
  } else {
    const batch = admin.firestore().batch();
    if (uniqueFieldBefore) {
      batch.delete(auxCollection.doc(uniqueFieldBefore));
    }
    batch.set(auxCollection.doc(uniqueFieldAfter), {id: after.id, [config.fieldName]: after.get(config.fieldName)});
    await batch.commit();
    functions.logger.log("Document updated with unique field");
  }
};

const handleExistingDocument = async (
  snapshot: admin.firestore.DocumentSnapshot,
  bulkWriter: admin.firestore.BulkWriter
): Promise<void> => {
  const uniqueField = extractUniqueField(snapshot);
  try {
    if (uniqueField) {
      // the doc has been added with a unique field, we need to add a new doc to the aux collection
      const auxDoc = await auxCollection.doc(uniqueField).get();
      if (auxDoc.exists) {
        if (auxDoc.get("id") !== snapshot.id) {
          // if the ids don't match, it means it's a duplicate
          await bulkWriter.update(
            auxDoc.ref,
            {duplicate: true}
          );
          const message = `Document with unique field already existed, document with field ${config.fieldName} with value ${uniqueField} in ${config.collection} collection is duplicated`;

          functions.logger.log(message);
        }
      } else {
        await bulkWriter.set(
          auxDoc.ref,
          {id: snapshot.id, [config.fieldName]: snapshot.get(config.fieldName)}
        );
      }
    } else {
      functions.logger.log("Document without unique field, no processing is required");
    }
  } catch (err) {
    functions.logger.log(`Error executing Field Uniqueness backfill with ${config.collection}: ${uniqueField}`, err);
    throw err;
  }
};

export const fieldUniquenessBackfill = functions.tasks
  .taskQueue()
  .onDispatch(async (data: any) => {
    const runtime = getExtensions().runtime();
    if (config.doBackfill !== "yes") {
      await runtime.setProcessingState(
        "PROCESSING_COMPLETE",
        "Existing documents were not checked for uniqueness because 'Check uniqueness for existing documents?' is configured to false. " +
          "If you want to fill in missing checks, reconfigure this instance."
      );
      return;
    }
    const offset = (data["offset"] as number) ?? 0;
    const pastSuccessCount = (data["successCount"] as number) ?? 0;
    const pastErrorCount = (data["errorCount"] as number) ?? 0;
    // We also track the start time of the first invocation, so that we can report the full length at the end.
    const startTime = (data["startTime"] as number) ?? Date.now();

    const snapshot = await admin
      .firestore()
      .collection(config.collection)
      .offset(offset)
      .limit(DOCS_PER_BACKFILL)
      .get();
    // Since we will be writing many docs to Firestore, use a BulkWriter for better performance.
    const writer = admin.firestore().bulkWriter();
    const documentsChecked = await Promise.allSettled(
      snapshot.docs.map((doc) => {
        return handleExistingDocument(doc, writer);
      })
    );
    // Close the writer to commit the changes to Firestore.
    await writer.close();
    const newSuccessCount =
      pastSuccessCount +
      documentsChecked.filter((p) => p.status === "fulfilled").length;
    const newErrorCount =
      pastErrorCount +
      documentsChecked.filter((p) => p.status === "rejected").length;

    if (snapshot.size == DOCS_PER_BACKFILL) {
      // Stil have more documents to check uniqueness, enqueue another task.
      functions.logger.log(`Enqueue next: ${(offset + DOCS_PER_BACKFILL)}`);
      const queue = getFunctions().taskQueue(
        "fieldUniquenessBackfill",
        process.env.EXT_INSTANCE_ID
      );
      await queue.enqueue({
        offset: offset + DOCS_PER_BACKFILL,
        successCount: newSuccessCount,
        errorCount: newErrorCount,
        startTime: startTime,
      });
    } else {
      // No more documents to check uniqueness for, time to set the processing state.
      functions.logger.log(`Backfill complete. Success count: ${newSuccessCount}, Error count: ${newErrorCount}`);
      if (newErrorCount == 0) {
        return await runtime.setProcessingState(
          "PROCESSING_COMPLETE",
          `Successfully checked uniqueness for ${newSuccessCount} documents in ${
            Date.now() - startTime
          }ms.`
        );
      } else if (newErrorCount > 0 && newSuccessCount > 0) {
        return await runtime.setProcessingState(
          "PROCESSING_WARNING",
          `Successfully checked uniqueness for ${newSuccessCount} documents, ${newErrorCount} errors in ${
            Date.now() - startTime
          }ms. See function logs for specific error messages.`
        );
      }
      return await runtime.setProcessingState(
        "PROCESSING_FAILED",
        `Successfully checked uniqueness for ${newSuccessCount} documents, ${newErrorCount} errors in ${
          Date.now() - startTime
        }ms. See function logs for specific error messages.`
      );
    }
  });

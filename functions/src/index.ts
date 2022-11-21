import * as admin from "firebase-admin";
import * as functions from 'firebase-functions';

enum ChangeType {
  CREATE,
  DELETE,
  UPDATE,
}

const config = {
  location: process.env.LOCATION || "",
  collection: process.env.COLLECTION_PATH || "",
  fieldName: process.env.FIELD_NAME || "",
  auxCollection: process.env.AUX_COLLECTION_PATH || "",
};

admin.initializeApp();

exports.fieldUniqueness =  functions.handler.firestore.document.onWrite(
  async (change): Promise<void> => {
    const changeType = getChangeType(change);
    functions.logger.log('Started execution of Field Uniqueness extension');
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
      functions.logger.log('Completed execution of Field Uniqueness extension');
    } catch (err) {
      functions.logger.log('Error executing Field Uniqueness extension', err);
    }
  }
);

const auxCollection = admin.firestore().collection(config.auxCollection);

const extractUniqueField = (snapshot: admin.firestore.DocumentSnapshot): string => {
  return snapshot.get(config.fieldName);
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
    await auxCollection.doc(uniqueField).set({id: snapshot.id});
    functions.logger.log('Document created with unique field');
  } else {
    functions.logger.log('Document created without unique field, no processing is required');
  }
};

const handleDeleteDocument = async (
  snapshot: admin.firestore.DocumentSnapshot,
): Promise<void> => {
  const uniqueField = extractUniqueField(snapshot);
  if (uniqueField) {
    await auxCollection.doc(uniqueField).delete();
    functions.logger.log('Document updated with unique field');
  } else {
    functions.logger.log('Document deleted without unique field, no processing is required');
  }
};

const handleUpdateDocument = async (
  before: admin.firestore.DocumentSnapshot,
  after: admin.firestore.DocumentSnapshot,
): Promise<void> => {
  const uniqueFieldBefore = extractUniqueField(before);
  const uniqueFieldAfter = extractUniqueField(after);
  console.log('handleUpdateDocument', uniqueFieldBefore, uniqueFieldAfter);

  // If previous and updated documents have no unique field, skip.
  if (uniqueFieldBefore === undefined && uniqueFieldAfter === undefined) {
    functions.logger.log('Document updated without unique field, no processing is required');
    return;
  }

  // If unique field from previous and updated documents didn't change, skip.
  if (uniqueFieldBefore === uniqueFieldAfter) {
    functions.logger.log('Document updated, unique field has not changed, no processing is required');
    return;
  } else {
    const batch = admin.firestore().batch();
    if (uniqueFieldBefore) {
      batch.delete(auxCollection.doc(uniqueFieldBefore));
    }
    batch.set(auxCollection.doc(uniqueFieldAfter), {id: after.id});
    await batch.commit();
    functions.logger.log('Document updated with unique field');
  }
};
import { DocumentData, Query } from 'firebase-admin/firestore';

export const waitForDocumentToExistInCollection = (
  query: Query,
  field: string | number,
  value: any,
  timeout = 10_000,
): Promise<DocumentData> => {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(
        new Error(
          `Timeout waiting for firestore document to exist with field ${field} in collection`,
        ),
      );
    }, timeout);

    const unsubscribe = query.onSnapshot(async snapshot => {
      const docs = snapshot.docChanges();

      const record: DocumentData = docs.filter(
        $ => $.doc.data()[field] === value,
      )[0];

      if (record) {
        unsubscribe();
        if (!timedOut) {
          clearTimeout(timer);
          resolve(record);
        }
      }
    });
  });
};

export const waitForDocumentDelete = (
  document: DocumentData,
  timeout: number = 10_000
): Promise<FirebaseFirestore.DocumentData> => {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(
        new Error(
          `Timeout waiting for firestore document to delete`
        )
      );
    }, timeout);
    const unsubscribe = document.onSnapshot(async (snapshot: DocumentData) => {
      if (!snapshot.exists) {
        unsubscribe();
        if (!timedOut) {
          clearTimeout(timer);
          resolve(snapshot);
        }
      }
    });
  });
};
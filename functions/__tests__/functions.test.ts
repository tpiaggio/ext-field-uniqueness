import * as admin from "firebase-admin";
import { waitForDocumentDelete, waitForDocumentToExistInCollection } from './helpers';
import setupExtension from './helpers/setupExtension';

/** required to ensure the emulator port is used for the tests */
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";

admin.initializeApp({
 projectId: "demo-test",
});
setupExtension();

describe("extension", () => {
 const db = admin.firestore();

 test("functions are exported", () => {
    expect(true).toBe(true);
  });

 test("creates, updates and deletes documents in aux collection", async () => {
   //creates document with username in collection
   const doc = await db.collection("users").add({ username: "johndoe" });
   
   //creates document with username in aux collection
   const johnDoe = await waitForDocumentToExistInCollection(db.collection("usernames"), "username", "johndoe");
   expect(johnDoe.doc.data()).toEqual({ id: doc.id, username: "johndoe" });

   //updates username of document in collection
   await db.collection("users").doc(doc.id).update({username: "janedoe"});
   
   //creates document with new username in aux collection
   const janeDoe = await waitForDocumentToExistInCollection(db.collection("usernames"), "username", "janedoe");
   expect(janeDoe.doc.data()).toEqual({ id: doc.id, username: "janedoe" });

   //deletes document with previous username in aux collection
   const johnDoeDeleted = await waitForDocumentDelete(db.collection("usernames").doc("johnDoe"));
   expect(johnDoeDeleted.exists).toEqual(false);

   //deletes document with username
   await doc.delete();

   //deletes document with username in aux collection
   const janeDoeDeleted = await waitForDocumentDelete(db.collection("usernames").doc("janeDoe"));
   expect(janeDoeDeleted.exists).toEqual(false);
 });
});
## Version 0.1.4

added testing using jest and the Firebase Emulator Suite.

## Version 0.1.3

feature - When executing the backfill function, add a property named _duplicate_ which is set to true if there were duplicate values of the unique field.

## Version 0.1.2

feature - Added backfill capabilities so that we can have existing documents in the Firestore collection be checked for field uniqueness.

## Version 0.0.2

feature - Update Cloud Functions runtime to Node.js 14.

feature - Add the HASH_FIELD parameter so that we can decide if we want to hash the field name or not, due to contraints on document IDs.

## Version 0.0.1

Initial release of the _Field Uniqueness_ extension.
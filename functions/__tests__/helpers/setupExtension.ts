export default () => {
  process.env.COLLECTION_PATH = 'users';
  process.env.FIELD_NAME = 'username';
  process.env.HASH_FIELD = 'no';
  process.env.LOCATION = 'us-central1';
  process.env.DO_BACKFILL = 'yes';
  process.env.AUX_COLLECTION_PATH = 'usernames';
};
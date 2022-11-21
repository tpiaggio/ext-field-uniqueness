### See it in action

You can test out this extension right away!

1.  Go to your [Cloud Firestore dashboard](https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data) in the Firebase console.

1.  If it doesn't exist already, create a collection called `${COLLECTION_PATH}`.

1.  Create a document with a field named `${FIELD_NAME}`, then make its value a string you want to ensure it's unique.

1.  In a few seconds, you'll see a new collection in Firestore called `${AUX_COLLECTION_PATH}` with a new document, that document will have as the key the value of the field `${FIELD_NAME}` of the  document you just created in `${COLLECTION_PATH}`.

1.  This newly created collection and documents, used in combination with Security Rules, will prevent the client creating documents with duplicate values for the specified field.


#### Using the extension

Write a document with id _exampleId_ with the string _"bob1234"_ to the field `${FIELD_NAME}` in `${COLLECTION_PATH}` will result in the following document written in `${AUX_COLLECTION_PATH}`:

```js
{
  bob1234: {
    id: exampleId  
  },
}
```

Now, if a client-side app wants to create / update a document with the string _"bob1234"_ to the field `${FIELD_NAME}` in `${COLLECTION_PATH}`, the following Security Rules witll throw an error, thus preventing the client to execute the write:

```js
function isFieldAvailable() {
  return !exists(/databases/$(database)/documents/${AUX_COLLECTION_PATH}/$(request.resource.data.${FIELD_NAME}));
}

function fieldDidNotChange() {
  return request.resource.data.${FIELD_NAME} == resource.data.${FIELD_NAME};
}

match /${COLLECTION_PATH}/{id} {
  allow read: if ...;
  allow create: if isFieldAvailable();
  allow update: if fieldDidNotChange() || isFieldAvailable();
  allow delete: if ...;
}
```

### Monitoring

As a best practice, you can [monitor the activity](https://firebase.google.com/docs/extensions/manage-installed-extensions#monitor) of your installed extension, including checks on its health, usage, and logs.
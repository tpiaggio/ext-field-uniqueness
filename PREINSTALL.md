Use this extension to ensure uniqueness on a specified field (for example, username) of a document within a specified to a Cloud Firestore collection (for example, users).

This extension listens to your specified Cloud Firestore collection. If you add a string to a specified field in any document within that collection, this extension:

- Gets the type of event it listened to and the string value of the specified field.
- Creates or deletes a document with that value as it's key on a separate specified aux collection.
- Allows you to decide if you want to check uniqueness for existing documents or only new ones.

#### Firestore Security Rules

This extension works in combination with Firestore Security Rules. The goal of this extension is to maintain documents on an aux collection, each document having the unique field value as the key, and thus checking for uniqueness of these documents using Firestore Security Rules.

In the following example, we'll be using _users_ and _username_ as the collection and field respectively, but it could be any field name and collection name (the _.lower()_ piece is optional in case uniqueness is not case sensitive).

```js
function isUsernameAvailable() {
  return !exists(/databases/$(database)/documents/usernames/$(request.resource.data.username.lower()));
}

function usernameDidNotChange() {
  return request.resource.data.username == resource.data.username;
}

match /users/{userId} {
  allow read: if ...;
  allow create: if isUsernameAvailable();
  allow update: if usernameDidNotChange() || isUsernameAvailable();
  allow delete: if ...;
}
```

If you want, you can hash the value of the field due to contraints on document IDs. For that, you can select 'Yes' when you're prompted to select if you want to hash the field or not. The Security Rules change slightly, looking like this:

```js
function isUsernameAvailable() {
  let username = hashing.md5(request.resource.data.username).toHexString().lower();
  return !exists(/databases/$(database)/documents/usernames/$(username));
}
```

#### Additional setup

Before installing this extension, make sure that you've [set up a Cloud Firestore database](https://firebase.google.com/docs/firestore/quickstart) in your Firebase project.

#### Billing
To install an extension, your project must be on the [Blaze (pay as you go) plan](https://firebase.google.com/pricing)

- You will be charged a small amount (typically around $0.01/month) for the Firebase resources required by this extension (even if it is not used).
- This extension uses other Firebase and Google Cloud Platform services, which have associated charges if you exceed the service’s no-cost tier:
  - Cloud Firestore
  - Cloud Functions (Node.js 10+ runtime. [See FAQs](https://firebase.google.com/support/faq#extensions-pricing))

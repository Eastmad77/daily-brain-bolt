// Shared Firebase Admin initializer for Netlify Functions
// Expects FIREBASE_SERVICE_ACCOUNT env var to be a **base64-encoded JSON key**
// (Create a Service Account key in GCP → IAM → Keys → JSON, then base64 encode)

import admin from 'firebase-admin';

let app; // singleton

export function getAdmin() {
  if (!app) {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT missing');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const creds = JSON.parse(json);

    app = admin.initializeApp({
      credential: admin.credential.cert(creds),
    });
  }
  const db = admin.firestore();
  return { admin, db };
}

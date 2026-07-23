import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'adgen-pharmacy',
  });
}

export const firebaseAuth = admin.auth();
export const firebaseDb = admin.firestore();

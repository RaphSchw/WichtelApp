// Firebase-Web-Konfiguration.
// apiKey und appId stehen NICHT im Repo: GitHub Actions setzt sie beim Veröffentlichen aus den
// Repository-Secrets FIREBASE_API_KEY und FIREBASE_APP_ID ein (siehe .github/workflows/ci.yml).
// Hinweis: Im veröffentlichten Browser-Code sind sie technisch sichtbar – das ist bei Firebase so vorgesehen.
// Geschützt werden die Daten durch firestore.rules und die Beschränkung des Schlüssels auf raphschw.github.io.
export const firebaseConfig = {
  apiKey: '__FIREBASE_API_KEY__',
  authDomain: 'wichtelapp-30310.firebaseapp.com',
  projectId: 'wichtelapp-30310',
  storageBucket: 'wichtelapp-30310.firebasestorage.app',
  messagingSenderId: '150496852387',
  appId: '__FIREBASE_APP_ID__',
};

export const FIREBASE_SDK = '10.14.1';

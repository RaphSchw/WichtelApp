// Speicher-Adapter für Firebase (Firestore + Google-Anmeldung).
// Daten liegen unter users/{uid}/groups/{groupId}; Einstellungen in users/{uid}.
import { firebaseConfig, FIREBASE_SDK } from './config.js';

const sdk = name => import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK}/firebase-${name}.js`);

export async function createFirebaseStore({ emulator = false } = {}) {
  const [{ initializeApp }, A, F] = await Promise.all([sdk('app'), sdk('auth'), sdk('firestore')]);
  const config = emulator ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-wichteln' } : firebaseConfig;
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  if (emulator) {
    A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  const groupsCol = uid => F.collection(db, 'users', uid, 'groups');
  const clean = o => JSON.parse(JSON.stringify(o));

  return {
    kind: emulator ? 'emulator' : 'firebase',
    onAuth: cb => A.onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, name: u.displayName || u.email || 'Test' } : null)),
    // Im Emulator anonym anmelden (für automatische Tests), sonst Google-Popup.
    signIn: () => emulator ? A.signInAnonymously(auth) : A.signInWithPopup(auth, new A.GoogleAuthProvider()),
    signOut: () => A.signOut(auth),
    subscribeGroups(uid, next, error) {
      return F.onSnapshot(groupsCol(uid), snap => next(
        snap.docs.map(d => ({ id: d.id, data: d.data() })),
        { fromCache: snap.metadata.fromCache, removed: snap.docChanges().filter(c => c.type === 'removed').map(c => c.doc.id) }
      ), error);
    },
    saveGroup: (uid, g) => F.setDoc(F.doc(db, 'users', uid, 'groups', g.id), clean(g)),
    deleteGroup: (uid, id) => F.deleteDoc(F.doc(db, 'users', uid, 'groups', id)),
    async loadSettings(uid) { const s = await F.getDoc(F.doc(db, 'users', uid)); return s.exists() ? s.data() : {}; },
    saveSettings: (uid, data) => F.setDoc(F.doc(db, 'users', uid), clean(data), { merge: true }),
  };
}

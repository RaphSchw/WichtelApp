// Speicher-Adapter für Firebase (Firestore + Google-Anmeldung).
// Daten liegen unter users/{uid}/groups/{groupId}; Einstellungen in users/{uid}.
import { firebaseConfig, FIREBASE_SDK } from './config.js';

const sdk = name => import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK}/firebase-${name}.js`);

export async function createFirebaseStore({ emulator = false } = {}) {
  const [{ initializeApp }, A, F] = await Promise.all([sdk('app'), sdk('auth'), sdk('firestore')]);
  const config = emulator ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-wichteln' } : firebaseConfig;
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  // Fallback, falls die Live-Verbindung (WebChannel) blockiert wird: Long-Polling erzwingen.
  let forceLP = false; try { forceLP = localStorage.getItem('wichtel-longpolling') === '1'; } catch (e) {}
  const db = forceLP ? F.initializeFirestore(app, { experimentalForceLongPolling: true }) : F.getFirestore(app);
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
    longPolling: forceLP,
    useLongPolling() { try { localStorage.setItem('wichtel-longpolling', '1'); } catch (e) {} },
    /** Fragt die Datenbank einmal direkt (ohne Live-Verbindung) und liefert die Ursache, falls etwas nicht stimmt. */
    async diagnose(uid) {
      if (emulator) return 'ok';
      try {
        const token = await auth.currentUser.getIdToken();
        const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/users/${uid}?key=${config.apiKey}`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const body = await r.text();
        console.warn('Firestore-Diagnose', r.status, body.slice(0, 500));
        if (r.ok) return 'realtime-blocked';
        if (r.status === 404 && /database.*does not exist|not exist.*database/i.test(body)) return 'no-database';
        if (r.status === 404) return 'realtime-blocked';
        if (r.status === 403 && /SERVICE_DISABLED|has not been used|is disabled/i.test(body)) return 'no-database';
        if (r.status === 403 && /API_KEY|blocked|referer/i.test(body)) return 'api-key-blocked';
        if (r.status === 403) return 'permission-denied';
        return 'http-' + r.status;
      } catch (e) { console.warn('Firestore-Diagnose fehlgeschlagen', e); return 'network'; }
    },
  };
}

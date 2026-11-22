// Test-Speicher im Browser (nur für automatische Tests auf localhost, Aufruf mit ?test).
// Verhält sich wie der Firebase-Adapter, speichert aber in localStorage.
const KEY = 'wichtel-test-db';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const persist = db => localStorage.setItem(KEY, JSON.stringify(db));

export function createMemoryStore() {
  const subs = new Set();
  let authCb = null;
  const user = () => sessionStorage.getItem('wichtel-test-user') ? { uid: 'test-user', name: 'Test' } : null;
  const emit = () => setTimeout(() => subs.forEach(f => f()), 10);
  return {
    kind: 'memory',
    onAuth: cb => { authCb = cb; setTimeout(() => cb(user()), 20); return () => { authCb = null; }; },
    signIn: async () => {
      const fail = sessionStorage.getItem('wichtel-test-fail'); // Fehlerfall für Tests simulieren
      if (fail) throw Object.assign(new Error(fail), { code: fail });
      sessionStorage.setItem('wichtel-test-user', '1'); authCb && authCb(user());
    },
    signOut: async () => { sessionStorage.removeItem('wichtel-test-user'); authCb && authCb(null); },
    subscribeGroups(uid, next) {
      let prev = new Set();
      const fire = () => {
        const g = (load()[uid] || {}).groups || {};
        const ids = new Set(Object.keys(g));
        const removed = [...prev].filter(i => !ids.has(i)); prev = ids;
        next(Object.entries(g).map(([id, data]) => ({ id, data })), { fromCache: false, removed });
      };
      subs.add(fire); setTimeout(fire, 30);
      return () => subs.delete(fire);
    },
    async saveGroup(uid, g) { const db = load(); db[uid] = db[uid] || {}; db[uid].groups = db[uid].groups || {}; db[uid].groups[g.id] = JSON.parse(JSON.stringify(g)); persist(db); emit(); },
    async deleteGroup(uid, id) { const db = load(); if (db[uid] && db[uid].groups) delete db[uid].groups[id]; persist(db); emit(); },
    async loadSettings(uid) { return (load()[uid] || {}).settings || {}; },
    async saveSettings(uid, data) { const db = load(); db[uid] = db[uid] || {}; db[uid].settings = { ...(db[uid].settings || {}), ...data }; persist(db); },
  };
}

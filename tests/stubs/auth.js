export const getAuth = () => ({}); export class GoogleAuthProvider { setCustomParameters() {} }
export const signInWithPopup = async () => ({}); export const signOut = async () => { globalThis.__USER__ = null; };
export const onAuthStateChanged = (_a, cb) => { setTimeout(() => cb(globalThis.__USER__ || null), 0); return () => {}; };

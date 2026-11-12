
export const authUser = { uid: "u1", displayName: "Teste", email: "t@t.com", photoURL: null };
export const auth = { currentUser: authUser };
export const getAuth = () => auth;
export class GoogleAuthProvider { setCustomParameters() { return this; } }
export const setPersistence = async () => {};
export const indexedDBLocalPersistence = {}; export const browserLocalPersistence = {};
export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb(auth.currentUser), 30); return () => {}; };
export const signInWithPopup = async () => {}; export const signInWithRedirect = async () => {};
export const getRedirectResult = async () => null; export const signOut = async () => {};
export const deleteUser = async () => {}; export const reauthenticateWithPopup = async () => {};

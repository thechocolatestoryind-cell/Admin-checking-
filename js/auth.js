// Google-only sign-in + UI gate for the single admin account.
// IMPORTANT: this is only a UI gate. Real protection is Firestore Rules (see docs/ADMIN_SECURITY_NOTES.md).
import { auth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "./firebase.js";
import { ADMIN_EMAIL } from "./config.js";
import { PAGE_FILES } from "./pages.js";

async function evaluate(user) {
  if (!user) return { state: "signed-out" };
  const deny = reason => ({ state: "denied", reason, email: user.email || "" });
  if (!user.email) return deny("no-email");
  let provider = null;
  try { provider = (await user.getIdTokenResult()).signInProvider; }
  catch (_) { provider = user.providerData.some(p => p.providerId === "google.com") ? "google.com" : null; }
  if (provider !== "google.com") return deny("not-google");
  if (!user.emailVerified) return deny("unverified");
  if (user.email !== ADMIN_EMAIL) return deny("wrong-account");
  return { state: "allowed", user };
}

export function watchAdmin(callback) {
  return onAuthStateChanged(auth,
    async user => callback(await evaluate(user)),
    error => callback({ state: "error", error }));
}

export const DENIAL_TEXT = {
  "wrong-account": "This Google account is not authorised to use the admin panel.",
  "no-email": "The Google account did not provide an email address, so access cannot be checked.",
  "unverified": "This Google account's email is not verified.",
  "not-google": "Only Google sign-in is accepted for the admin panel."
};

export function currentFile() {
  return location.pathname.split("/").pop() || "index.html";
}

// Only known page files (with an optional simple ?id=) may be used as a post-login target.
export function nextPageFromQuery() {
  const next = new URLSearchParams(location.search).get("next") || "";
  const m = /^([a-z-]+\.html)(\?id=[A-Za-z0-9_-]{1,64})?$/.exec(next);
  return m && PAGE_FILES.includes(m[1]) ? next : "dashboard.html";
}

// Guard for every private page. Resolves with the Firebase user only when allowed;
// in every other case it redirects and the promise never resolves (page stays hidden).
export function requireAdmin() {
  return new Promise(resolve => {
    let resolved = false;
    watchAdmin(res => {
      if (res.state === "allowed") {
        if (!resolved) { resolved = true; resolve(res.user); }
        return;
      }
      const target = res.state === "signed-out"
        ? "login.html?next=" + encodeURIComponent(currentFile() + (/^\?id=[A-Za-z0-9_-]{1,64}$/.test(location.search) ? location.search : ""))
        : "login.html";
      location.replace(target);
    });
  });
}

export function authErrorMessage(err) {
  const code = (err && err.code) || "";
  const map = {
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
    "auth/popup-closed-by-user": "The sign-in window was closed before finishing. Try again when ready.",
    "auth/cancelled-popup-request": "Another sign-in window was already open. Try once more.",
    "auth/network-request-failed": "Network problem while signing in. Check your connection and try again.",
    "auth/unauthorized-domain": "This website address is not on Firebase's authorised domains list yet (Firebase Console \u2192 Authentication \u2192 Settings \u2192 Authorized domains).",
    "auth/operation-not-allowed": "Google sign-in is not enabled for this Firebase project yet.",
    "auth/too-many-requests": "Too many attempts. Wait a little and try again.",
    "auth/user-disabled": "This account has been disabled."
  };
  return map[code] || "Sign-in did not complete. Please try again.";
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export function signOutAdmin() { return signOut(auth); }

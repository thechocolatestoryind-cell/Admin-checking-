import { db, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "../firebase.js";
import { COL, SITE_SETTINGS_DOC_ID } from "../collections.js";
import { assertOnline } from "./util.js";

const ref = () => doc(db, COL.siteSettings, SITE_SETTINGS_DOC_ID);   // always siteSettings/public; no other settings collection
export async function getSettings() { const s = await getDoc(ref()); return s.exists() ? { exists: true, data: s.data() } : { exists: false, data: {} }; }
// Targeted: only the fields that changed are written, so unknown existing fields are preserved.
export async function saveSettings(patch, exists) {
  assertOnline();
  if (exists) await updateDoc(ref(), { ...patch, updatedAt: serverTimestamp() });
  else await setDoc(ref(), { ...patch, updatedAt: serverTimestamp() });
}

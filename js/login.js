import { watchAdmin, signInWithGoogle, signOutAdmin, authErrorMessage, nextPageFromQuery, DENIAL_TEXT } from "./auth.js";
import { registerServiceWorker } from "./common.js";

registerServiceWorker();
const $ = id => document.getElementById(id);
const show = name => { for (const s of ["loading", "signed-out", "denied"]) $("state-" + s).hidden = s !== name; };
const showError = msg => { const e = $("login-error"); e.textContent = msg || ""; e.hidden = !msg; };

watchAdmin(res => {
  showError("");
  if (res.state === "allowed") { location.replace(nextPageFromQuery()); return; }
  if (res.state === "denied") {
    $("denied-text").textContent = DENIAL_TEXT[res.reason] || "This account cannot use the admin panel.";
    $("denied-account").textContent = res.email ? "Signed in as " + res.email : "";
    show("denied"); return;
  }
  if (res.state === "error") showError("Could not check sign-in status. Check your connection and reload.");
  show("signed-out");
});

let busy = false;
$("btn-signin").addEventListener("click", async () => {
  if (busy) return;
  if (!navigator.onLine) { showError("You appear to be offline. Connect to the internet to sign in."); return; }
  busy = true; $("btn-signin").disabled = true; showError("");
  try { await signInWithGoogle(); }
  catch (e) { showError(authErrorMessage(e)); }
  finally { busy = false; $("btn-signin").disabled = false; }
});
$("btn-signout").addEventListener("click", async () => {
  $("btn-signout").disabled = true;
  try { await signOutAdmin(); } catch (e) { showError("Sign-out failed. Please reload and try again."); }
  finally { $("btn-signout").disabled = false; }
});

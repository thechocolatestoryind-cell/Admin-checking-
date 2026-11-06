// Error wording + online guard shared by all data services. No Firebase import (testable in Node).
export function describeError(e) {
  const code = (e && e.code) || "";
  if (code === "permission-denied")
    return "This action is blocked by current Firebase permissions. Make sure you are signed in as the owner and the Firestore rules are deployed. (permission-denied)";
  if (code === "unauthenticated") return "Your sign-in has expired. Sign in again and retry. (unauthenticated)";
  if (code === "unavailable" || code === "deadline-exceeded" || code === "app/offline")
    return "Network problem: the request could not reach Firebase. Check your connection and try again.";
  if (code === "failed-precondition") return "Firestore could not run this request (for example a missing index). (failed-precondition)";
  if (code === "invalid-argument") return "Firestore rejected some of the data. Check the values and try again. (invalid-argument)";
  if (code === "resource-exhausted") return "Firebase quota reached for now. Try again later. (resource-exhausted)";
  return "Something went wrong (" + (code || "unknown") + ").";
}
export function assertOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    throw Object.assign(new Error("offline"), { code: "app/offline" });
}

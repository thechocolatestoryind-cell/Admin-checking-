// Redirects the gstatic Firebase SDK URLs to in-memory stubs so services can run in Node.
import { pathToFileURL } from "node:url"; import path from "node:path";
const stubs = { "firebase-app.js": "app.js", "firebase-auth.js": "auth.js", "firebase-firestore.js": "firestore.js" };
export async function resolve(spec, ctx, next) {
  const m = /gstatic\.com\/firebasejs\/[^/]+\/(.+)$/.exec(spec);
  if (m) return { url: pathToFileURL(path.resolve("tests/stubs", stubs[m[1]])).href, shortCircuit: true };
  return next(spec, ctx);
}

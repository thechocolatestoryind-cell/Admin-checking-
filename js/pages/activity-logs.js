import { el, formatDateTime } from "../common.js";
import { input, stateBox } from "../ui/forms.js";
import { note, pager } from "../ui/bits.js";
import { listLogs } from "../services/logs.js";
import { describeError } from "../services/util.js";

export async function render(body) {
  let logs = []; const search = input({ type: "search", placeholder: "Action, description or target", "aria-label": "Search activity log" });
  search.addEventListener("input", draw); const count = el("p", { class: "small muted", role: "status", "aria-live": "polite" }), list = el("div");
  body.append(note("Read-only. The current Firestore rules block every browser write to this log, so this panel cannot add entries, and nothing here is an audit trail of what you do in the panel. Reliable audit logging needs a trusted backend."),
    el("div", { class: "toolbar" }, el("button", { class: "btn btn-quiet", type: "button", text: "Refresh", onclick: load })), el("div", { class: "filters" }, search), count, list);
  async function load() {
    list.replaceChildren(el("p", { class: "muted", role: "status", text: "Loading log\u2026" }));
    try { logs = await listLogs(); draw(); } catch (e) { list.replaceChildren(stateBox("Could not load the activity log", describeError(e), el("button", { class: "btn", type: "button", text: "Try again", onclick: load }))); }
  }
  function draw() {
    const t = search.value.trim().toLowerCase(), rows = logs.filter(l => !t || [l.action, l.description, l.targetCollection, l.targetDocumentId, l.adminEmail].some(x => String(x || "").toLowerCase().includes(t)));
    count.textContent = "Showing " + rows.length + " of " + logs.length + " entries.";
    if (!logs.length) { list.replaceChildren(stateBox("No log entries", "Entries are written by a trusted backend, not by this panel.")); return; }
    if (!rows.length) { list.replaceChildren(stateBox("No entries match", "Try another search.")); return; }
    pager(rows, 50, l => el("li", { class: "row-card" }, el("div", { class: "grow" }, el("p", { class: "row-title wrap", text: l.description || l.action || "(no description)" }),
      el("p", { class: "small muted wrap", text: [l.action, l.targetCollection && l.targetCollection + (l.targetDocumentId ? "/" + l.targetDocumentId : ""), l.adminEmail].filter(Boolean).join(" \u2013 ") }), el("p", { class: "small muted", text: formatDateTime(l.createdAt) }))), list);
  }
  await load();
}

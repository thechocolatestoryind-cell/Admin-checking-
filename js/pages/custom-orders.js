import { el, toast, formatDateTime, formatDate, formatINR, safeUrl } from "../common.js";
import { field, input, textarea, select, showErrors, stateBox } from "../ui/forms.js";
import { badge, kv, note, pager } from "../ui/bits.js";
import { openImage } from "../ui/lightbox.js";
import { listRequests, getRequest, updateRequest } from "../services/requests.js";
import { requestMatches, requestContact, validateRequestUpdate, REQUEST_STATUSES, REQUEST_LABEL } from "../services/admin-logic.js";
import { CONTACT_METHODS } from "../collections.js";
import { describeError } from "../services/util.js";

const label = s => REQUEST_LABEL[s] || (s ? String(s) : "No status");
const statusBadge = s => badge(label(s), s === "new" ? "badge-warn" : s === "completed" ? "badge-ok" : s === "declined" ? "badge-bad" : "badge-info");

export async function render(body) {
  const raw = new URLSearchParams(location.search).get("id");
  if (raw) return detail(body, /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : null);
  let reqs = []; const want = new URLSearchParams(location.search).get("status");
  const search = input({ type: "search", placeholder: "Name, phone or description", "aria-label": "Search requests" });
  const fStatus = select([["", "Any status"], ...REQUEST_STATUSES.map(s => [s, label(s)])], REQUEST_STATUSES.includes(want) ? want : ""), fMethod = select([["", "Any contact method"], ...CONTACT_METHODS.map(m => [m, m])], "");
  const from = el("input", { type: "date", "aria-label": "From date" }), to = el("input", { type: "date", "aria-label": "To date" });
  for (const c of [search, fStatus, fMethod, from, to]) c.addEventListener("input", draw);
  const count = el("p", { class: "small muted", role: "status", "aria-live": "polite" }), list = el("div");
  body.append(el("div", { class: "toolbar" }, el("button", { class: "btn btn-quiet", type: "button", text: "Refresh", onclick: load })), el("div", { class: "filters" }, search, fStatus, fMethod, el("label", { class: "inline-label" }, "From", from), el("label", { class: "inline-label" }, "To", to)), count, list);
  async function load() {
    list.replaceChildren(el("p", { class: "muted", role: "status", text: "Loading requests\u2026" }));
    try { reqs = await listRequests(); draw(); } catch (e) { list.replaceChildren(stateBox("Could not load requests", describeError(e), el("button", { class: "btn", type: "button", text: "Try again", onclick: load }))); }
  }
  function draw() {
    const shown = reqs.filter(r => requestMatches(r, { text: search.value, status: fStatus.value, method: fMethod.value, from: from.value, to: to.value }));
    count.textContent = "Showing " + shown.length + " of " + reqs.length + " requests.";
    if (!reqs.length) { list.replaceChildren(stateBox("No custom requests yet", "Requests appear here when customers send them from the storefront. They cannot be created from the admin panel.")); return; }
    if (!shown.length) { list.replaceChildren(stateBox("No requests match", "Try clearing a filter or the search.")); return; }
    pager(shown, 30, r => el("li", { class: "row-card" }, el("div", { class: "grow" },
      el("p", { class: "row-title wrap" }, el("a", { href: "custom-orders.html?id=" + encodeURIComponent(r.id), text: (r.customerName || "").trim() || "Unnamed customer" })),
      el("p", { class: "small wrap", text: (r.productDescription || "No description").slice(0, 140) }), el("p", { class: "small muted", text: "Sent " + formatDateTime(r.createdAt) + " \u2013 via " + (r.contactMethod || "unknown") }),
      el("p", { class: "badges" }, statusBadge(r.status), typeof r.budget === "number" && r.budget > 0 ? badge("Budget " + formatINR(r.budget), "badge-off") : null)),
      el("a", { class: "btn btn-quiet btn-small", href: "custom-orders.html?id=" + encodeURIComponent(r.id), text: "Open" })), list);
  }
  await load();
}

async function detail(body, id) {
  const back = el("a", { class: "btn", href: "custom-orders.html", text: "Back to requests" });
  if (!id) { body.append(stateBox("Invalid request link", "", back)); return; }
  body.append(el("p", { class: "muted", role: "status", text: "Loading request\u2026" })); let r;
  try { r = await getRequest(id); } catch (e) { body.replaceChildren(stateBox("Could not load this request", describeError(e), back)); return; }
  if (!r) { body.replaceChildren(stateBox("Request not found", "", back)); return; }
  const c = requestContact(r), imgs = (Array.isArray(r.referenceImageURLs) ? r.referenceImageURLs : []).filter(u => safeUrl(u));
  const known = REQUEST_STATUSES.includes(r.status), st = select([...(known ? [] : [[r.status || "", label(r.status) + " (stored)"]]), ...REQUEST_STATUSES.map(s => [s, label(s)])], r.status || "new");
  const nt = textarea({ rows: 4, maxlength: 1000 }); nt.value = r.adminNote || ""; const save = el("button", { class: "btn", type: "submit", text: "Save status and note" });
  const form = el("form", { novalidate: true }, field("Status", st, { name: "status", hint: "These status words are chosen by this admin panel; the storefront does not need them." }), field("Private note", nt, { name: "adminNote", hint: "Only you see this. Up to 1000 characters." }), save);
  let busy = false;
  form.addEventListener("submit", async ev => {
    ev.preventDefault(); if (busy) return;
    const { errors, data } = validateRequestUpdate({ status: st.value, adminNote: nt.value }, r.status); showErrors(form, errors); if (errors.length) return;
    busy = true; save.disabled = true; save.textContent = "Saving\u2026";
    try { await updateRequest(id, data); r.status = data.status; r.adminNote = data.adminNote; toast("Request updated.", "success"); head.replaceChildren(statusBadge(r.status)); }
    catch (e) { toast("Nothing was saved. " + describeError(e), "error"); } finally { busy = false; save.disabled = false; save.textContent = "Save status and note"; }
  });
  const head = el("p", { class: "badges" }, statusBadge(r.status));
  body.replaceChildren(el("div", { class: "toolbar" }, back), el("div", { class: "detail-grid" },
    el("div", { class: "col" }, el("section", { class: "card" }, el("h2", { text: (r.customerName || "").trim() || "Unnamed customer" }), head,
      kv([["Phone", r.phoneNumber], ["Preferred contact", r.contactMethod], ["Budget", typeof r.budget === "number" && r.budget > 0 ? formatINR(r.budget) : ""], ["Wanted by", formatDate(r.requestedDate)], ["Sent", formatDateTime(r.createdAt)], ["Request id", r.id]]),
      el("h3", { text: "What they asked for" }), el("p", { class: "pre-wrap wrap", text: r.productDescription || "No description was provided." })),
      el("section", { class: "card" }, el("h2", { text: "Reference images" }), imgs.length ? el("div", { class: "row" }, imgs.map((u, i) => el("button", { class: "thumb-btn", type: "button", "aria-label": "View reference image " + (i + 1), onclick: () => openImage(u, "Reference image " + (i + 1)) }, el("img", { class: "thumb", src: safeUrl(u), alt: "", loading: "lazy", width: 64, height: 64 })))) : el("p", { class: "muted", text: "No reference images." }))),
    el("div", { class: "col" }, el("section", { class: "card" }, el("h2", { text: "Contact" }),
      el("div", { class: "row" }, c.whatsapp ? el("a", { class: "btn btn-quiet", href: c.whatsapp, target: "_blank", rel: "noopener noreferrer", text: "Open WhatsApp" }) : null, c.tel ? el("a", { class: "btn btn-quiet", href: c.tel, text: "Call" }) : null),
      !c.whatsapp && !c.tel ? el("p", { class: "muted", text: "No usable phone number was given." }) : null,
      c.instagramNoHandle ? el("p", { class: "small", text: "They chose Instagram, but no Instagram name is stored with the request. Reply from the business Instagram account manually." }) : null,
      note("Opening WhatsApp is a manual step. This app cannot send messages, and nothing here confirms a message was sent.")),
      el("section", { class: "card" }, el("h2", { text: "Follow-up" }), form))));
}

// Shared helpers: safe DOM, formatting, toasts, dialogs, shell, service worker.
import { PAGES, GROUPS, NAV_ORDER } from "./pages.js";
import { BRAND } from "./config.js";
import { PROJECT_ID } from "./firebase.js";
import { signOutAdmin } from "./auth.js";

/* ---------- safe DOM ---------- */
export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
const SVGNS = "http://www.w3.org/2000/svg";
const ICONS = {
  home: "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  box: "M21 8l-9-5-9 5v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8",
  tag: "M20 12l-8 8-9-9V3h8z M7.5 7.5h.01",
  cart: "M3 4h2l2.5 11h11L21 7H6 M9 20h.01 M17 20h.01",
  truck: "M2 6h11v10H2z M13 10h4l3 3v3h-7 M6 19h.01 M17 19h.01",
  card: "M2 6h20v12H2z M2 10h20",
  users: "M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M21 20v-2a4 4 0 0 0-3-3.9 M16 3.1a3.5 3.5 0 0 1 0 6.8",
  pencil: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  star: "M12 3l2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8z",
  image: "M3 5h18v14H3z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3 M21 15l-5-5L5 19",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  sliders: "M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M20 18h0 M14 4v4 M8 10v4 M16 16v4",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  close: "M6 6l12 12 M18 6L6 18",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9"
};
export function icon(name) {
  const s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "icon"); s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", ICONS[name] || ICONS.box); s.append(p);
  return s;
}

/* ---------- formatting (India time) ---------- */
export function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? null : d;
}
const dtFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
const dFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
export const formatDateTime = v => { const d = toDate(v); return d ? dtFmt.format(d) + " IST" : "\u2014"; };
export const formatDate = v => { const d = toDate(v); return d ? dFmt.format(d) : "\u2014"; };
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
export const formatINR = n => (typeof n === "number" && isFinite(n)) ? inr.format(n) : "\u2014";

/* ---------- links ---------- */
export function safeUrl(u) {
  try { const x = new URL(String(u).trim()); return (x.protocol === "https:" || x.protocol === "http:") ? x.href : null; }
  catch (_) { return null; }
}
export const whatsappLink = (digits = BRAND.whatsappDigits) => "https://wa.me/" + String(digits).replace(/\D/g, "");

/* ---------- toasts ---------- */
export function toast(message, type = "info") {
  let r = document.getElementById("toasts");
  if (!r) { r = el("div", { id: "toasts", class: "toasts", role: "status", "aria-live": "polite" }); document.body.append(r); }
  const t = el("div", { class: "toast toast-" + type, text: message }); r.append(t);
  setTimeout(() => t.remove(), type === "error" ? 8000 : 4000);
}

/* ---------- confirm dialog (native <dialog>: focus handling is built in) ---------- */
export function confirmDialog({ title, message, confirmText = "Confirm", danger = false }) {
  return new Promise(resolve => {
    const d = el("dialog", { class: "dialog", "aria-labelledby": "dlg-title" },
      el("h2", { id: "dlg-title", text: title }), el("p", { text: message }),
      el("div", { class: "row end" },
        el("button", { class: "btn btn-quiet", type: "button", text: "Cancel", onclick: () => d.close("no") }),
        el("button", { class: "btn " + (danger ? "btn-danger" : "btn-primary"), type: "button", text: confirmText, onclick: () => d.close("yes") })));
    d.addEventListener("close", () => { resolve(d.returnValue === "yes"); d.remove(); });
    document.body.append(d); d.showModal();
  });
}

/* ---------- service worker + update prompt ---------- */
function showUpdateBar(worker) {
  if (document.getElementById("update-bar")) return;
  const bar = el("div", { id: "update-bar", class: "bar bar-update", role: "status" },
    el("span", { text: "A new version of the admin panel is available." }),
    el("button", { class: "btn btn-small", type: "button", text: "Update now", onclick: () => worker.postMessage({ type: "SKIP_WAITING" }) }));
  document.body.prepend(bar);
}
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("sw.js");
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) showUpdateBar(w); });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
    } catch (e) { console.warn("Service worker registration failed"); }
  });
}

/* ---------- app shell ---------- */
export function renderShell(user, pageKey) {
  const page = PAGES[pageKey] || PAGES.dashboard;
  const navKey = page.parent || pageKey;
  const root = document.getElementById("root");
  root.textContent = "";

  const navGroups = GROUPS.map(g => {
    const items = NAV_ORDER.filter(k => PAGES[k].group === g.id);
    if (!items.length) return null;
    return el("div", { class: "nav-group" },
      el("p", { class: "nav-label", text: g.label }),
      el("ul", {}, items.map(k => el("li", {},
        el("a", { href: PAGES[k].file, class: "nav-link", "aria-current": k === navKey ? "page" : null }, icon(PAGES[k].icon), el("span", { text: PAGES[k].title }))))));
  });

  const signOutBtn = el("button", { class: "btn btn-quiet btn-small", type: "button", onclick: async () => {
    try { await signOutAdmin(); } finally { location.replace("login.html"); }
  } }, icon("logout"), el("span", { text: "Sign out" }));

  const sidebar = el("aside", { class: "sidebar", id: "sidebar", "aria-label": "Admin navigation" },
    el("a", { class: "brand", href: "dashboard.html", "aria-label": "The Chocolate Story admin, dashboard" },
      el("img", { src: "assets/logo.jpg", alt: "The Chocolate Story", width: 1536, height: 1024 })),
    el("nav", { "aria-label": "Sections" }, navGroups),
    el("div", { class: "sidebar-foot" }, el("p", { class: "muted small", text: "Signed in as" }), el("p", { class: "small wrap", text: user.email })));

  const scrim = el("div", { class: "scrim", id: "scrim", hidden: true });
  const menuBtn = el("button", { class: "icon-btn menu-btn", type: "button", "aria-label": "Open menu", "aria-expanded": "false", "aria-controls": "sidebar" }, icon("menu"));
  const statusDot = el("span", { class: "net net-on", id: "net-status", role: "status" }, el("span", { class: "dot" }), el("span", { id: "net-text", text: "Online" }));
  const avatar = (user.photoURL && safeUrl(user.photoURL))
    ? el("img", { class: "avatar", src: safeUrl(user.photoURL), alt: "", referrerpolicy: "no-referrer", width: 32, height: 32 })
    : el("span", { class: "avatar avatar-fallback", "aria-hidden": "true", text: (user.email || "?")[0].toUpperCase() });

  const topbar = el("header", { class: "topbar" }, menuBtn,
    el("p", { class: "topbar-title", text: page.title }), el("span", { class: "spacer" }), statusDot, avatar, signOutBtn);

  const crumbs = page.parent
    ? el("nav", { class: "crumbs", "aria-label": "Breadcrumb" }, el("a", { href: PAGES[page.parent].file, text: PAGES[page.parent].title }), el("span", { "aria-hidden": "true", text: "/" }), el("span", { text: page.title }))
    : null;
  const main = el("main", { id: "main", tabindex: "-1" }, crumbs, el("h1", { class: "page-title", text: page.title }), el("p", { class: "lede", text: page.blurb }), el("div", { id: "page-body" }));

  const offline = el("div", { id: "offline-bar", class: "bar bar-offline", role: "status", hidden: true },
    "You are offline. Saving and other changes are paused until the connection returns.");

  root.append(el("a", { class: "skip", href: "#main", text: "Skip to content" }),
    el("div", { class: "app" }, sidebar, scrim, el("div", { class: "content" }, topbar, offline, main)));

  /* mobile drawer */
  const open = () => { sidebar.classList.add("open"); scrim.hidden = false; menuBtn.setAttribute("aria-expanded", "true"); sidebar.querySelector(".nav-link").focus(); };
  const close = () => { sidebar.classList.remove("open"); scrim.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); };
  menuBtn.addEventListener("click", () => sidebar.classList.contains("open") ? close() : open());
  scrim.addEventListener("click", () => { close(); menuBtn.focus(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && sidebar.classList.contains("open")) { close(); menuBtn.focus(); } });

  /* connectivity */
  const sync = () => {
    const on = navigator.onLine;
    offline.hidden = on; statusDot.className = "net " + (on ? "net-on" : "net-off");
    document.getElementById("net-text").textContent = on ? "Online" : "Offline";
    document.body.classList.toggle("is-offline", !on);
  };
  addEventListener("online", sync); addEventListener("offline", sync); sync();
  document.title = page.title + " \u2013 " + BRAND.adminName;
  document.body.classList.remove("auth-pending");   // reveal only now: the guard has confirmed the owner
  return { body: document.getElementById("page-body"), projectId: PROJECT_ID };
}

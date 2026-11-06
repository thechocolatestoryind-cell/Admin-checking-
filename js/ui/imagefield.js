// One image: preview + Cloudinary upload + optional pasted https link. Holds the real URL only (never a blob: URL).
import { el, safeUrl, toast } from "../common.js";
import { createUploader } from "./uploader.js";
import { isHttps } from "../services/content-logic.js";

export function createImageField({ label, name, value = "", hint, onChange = () => {} }) {
  let url = value || "", uploaded = false;
  const prev = el("div", { class: "img-preview" }), linkIn = el("input", { type: "url", placeholder: "https://\u2026", "aria-label": label + " link", autocomplete: "off" });
  const err = el("p", { class: "field-error", "data-err-for": name || "", role: "alert", hidden: true });
  const draw = () => { const u = safeUrl(url);
    prev.replaceChildren(...[u ? el("img", { src: u, alt: label + " preview", width: 96, height: 96 }) : el("span", { class: "muted small", text: "No image" }),
      u ? el("button", { type: "button", class: "btn btn-quiet btn-small", text: "Remove", onclick: () => { url = ""; draw(); onChange(url); } }) : null].filter(Boolean)); };
  const up = createUploader({ multiple: false, onUploaded: u => { url = u; uploaded = true; draw(); onChange(url); } });
  const use = () => { const v = linkIn.value.trim(); if (!isHttps(v)) { toast("Enter a secure https link.", "error"); return; } url = v; linkIn.value = ""; draw(); onChange(url); };
  draw();
  return { get: () => url, set: v => { url = v || ""; draw(); }, uploadedThisSession: () => uploaded,
    element: el("div", { class: "field", "data-field": name || "" }, el("span", { class: "label-like", text: label }), prev, up.element,
      el("div", { class: "row nowrap" }, linkIn, el("button", { type: "button", class: "btn btn-quiet", text: "Use link", onclick: use })), hint ? el("p", { class: "hint small", text: hint }) : null, err) };
}

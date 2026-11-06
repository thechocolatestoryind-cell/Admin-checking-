import { el, safeUrl } from "../common.js";
// Native <dialog>: Esc closes, focus is trapped and restored by the browser. Backdrop click and a Close button also close it.
export function openImage(url, alt = "Image") {
  const u = safeUrl(url); if (!u) return;
  const d = el("dialog", { class: "lightbox", "aria-label": alt }, el("img", { src: u, alt }), el("button", { class: "btn", type: "button", text: "Close", onclick: () => d.close() }));
  d.addEventListener("click", e => { if (e.target === d) d.close(); });
  d.addEventListener("close", () => d.remove()); document.body.append(d); d.showModal();
}

import { el } from "../common.js";
export async function render(body) {
  const panel = el("div", { role: "tabpanel", id: "content-panel" }); let current = "";
  const defs = [["banners", "Banners", "./content-banners.js"], ["highlights", "Highlights", "./content-highlights.js"]];
  const tabs = el("div", { class: "tabs", role: "tablist", "aria-label": "Homepage content" }, defs.map(([k, t]) => el("button", { type: "button", role: "tab", id: "tab-" + k, "aria-controls": "content-panel", class: "tab", text: t, onclick: () => show(k) })));
  body.append(el("p", { class: "muted small", text: "Banners and highlights appear on the storefront home page only when they are active. The storefront decides how they are laid out." }), tabs, panel);
  async function show(k) {
    if (k === current) return; current = k;
    tabs.querySelectorAll("button").forEach(b => { const on = b.id === "tab-" + k; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    panel.setAttribute("aria-labelledby", "tab-" + k); panel.replaceChildren();
    await (await import(defs.find(d => d[0] === k)[2])).render(panel);
  }
  tabs.addEventListener("keydown", e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const i = defs.findIndex(d => d[0] === current), n = defs[(i + (e.key === "ArrowRight" ? 1 : defs.length - 1)) % defs.length][0]; show(n); tabs.querySelector("#tab-" + n).focus(); } });
  const want = new URLSearchParams(location.search).get("tab"); await show(defs.some(d => d[0] === want) ? want : "banners");
}

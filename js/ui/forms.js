import { el } from "../common.js";
let seq = 0;
// field(label, control, {hint, name}) -> labelled wrapper with an error slot keyed by `name`.
export function field(label, control, { hint, name } = {}) {
  const id = control.id || (control.id = "f" + (++seq));
  const err = el("p", { class: "field-error", id: id + "-err", role: "alert", "data-err-for": name || "", hidden: true });
  control.setAttribute("aria-describedby", id + "-err" + (hint ? " " + id + "-hint" : ""));
  return el("div", { class: "field", "data-field": name || "" },
    el("label", { for: id, text: label }), control, hint ? el("p", { class: "hint small", id: id + "-hint", text: hint }) : null, err);
}
export const input = (attrs = {}) => el("input", { type: "text", autocomplete: "off", ...attrs });
export const textarea = (attrs = {}) => el("textarea", { rows: 4, ...attrs });
export function select(options, value, attrs = {}) {
  const s = el("select", attrs, options.map(([v, t]) => el("option", { value: v, text: t })));
  s.value = value; return s;
}
export function check(label, checked, attrs = {}) {
  const i = el("input", { type: "checkbox", ...attrs }); i.checked = !!checked;
  return { input: i, node: el("label", { class: "check" }, i, el("span", { text: label })) };
}
export function showErrors(root, errors) {
  root.querySelectorAll(".field-error").forEach(e => { e.hidden = true; e.textContent = ""; });
  root.querySelectorAll("[aria-invalid]").forEach(e => e.removeAttribute("aria-invalid"));
  let first = null;
  for (const { field: f, msg } of errors) {
    const slot = root.querySelector('[data-err-for="' + f + '"]');
    if (slot) {
      slot.hidden = false; slot.textContent = slot.textContent ? slot.textContent + " " + msg : msg;
      const wrap = slot.closest(".field"), ctl = wrap && wrap.querySelector("input,select,textarea");
      if (ctl) { ctl.setAttribute("aria-invalid", "true"); first = first || ctl; }
    }
  }
  if (first) first.focus();
}
// Page-level state panels
export const stateBox = (title, text, ...actions) =>
  el("div", { class: "state", role: "status" }, el("h2", { text: title }), text ? el("p", { text }) : null,
    actions.length ? el("div", { class: "row" }, actions) : null);

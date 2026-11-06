// Image picker + Cloudinary upload queue with preview, progress, error and retry.
import { el } from "../common.js";
import { uploadImage, validateImageFile } from "../services/upload.js";

export function createUploader({ multiple = true, remaining = () => 99, onUploaded }) {
  const list = el("ul", { class: "uploads", "aria-live": "polite" });
  const fileInput = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple, class: "visually-hidden", "aria-label": multiple ? "Choose images to upload" : "Choose an image to upload" });
  const pick = el("button", { type: "button", class: "btn btn-quiet", text: multiple ? "Upload images" : "Upload image", onclick: () => fileInput.click() });
  let chain = Promise.resolve();

  function addItem(file) {
    const preview = URL.createObjectURL(file);
    const bar = el("progress", { max: 100, value: 0, "aria-label": "Upload progress" });
    const status = el("span", { class: "small muted", text: "Waiting\u2026" });
    const retry = el("button", { type: "button", class: "btn btn-small", text: "Retry", hidden: true });
    const dismiss = el("button", { type: "button", class: "btn btn-quiet btn-small", text: "Dismiss" });
    const li = el("li", { class: "upload-item" }, el("img", { src: preview, alt: "", width: 56, height: 56 }),
      el("div", { class: "grow" }, el("p", { class: "small wrap", text: file.name }), bar, status), retry, dismiss);
    list.append(li);
    const done = () => { URL.revokeObjectURL(preview); li.remove(); };
    dismiss.addEventListener("click", done);
    const run = async () => {
      retry.hidden = true; status.className = "small muted"; status.textContent = "Uploading\u2026"; bar.value = 0; bar.hidden = false;
      try {
        const url = await uploadImage(file, p => { bar.value = p; });
        onUploaded(url); status.textContent = "Uploaded"; bar.value = 100; setTimeout(done, 1200);
      } catch (e) {
        status.className = "small error-text"; status.textContent = e.message; bar.hidden = true; retry.hidden = false;
      }
    };
    retry.addEventListener("click", () => { chain = chain.then(run); });
    chain = chain.then(run);
  }

  fileInput.addEventListener("change", () => {
    const files = [...fileInput.files]; fileInput.value = "";
    let room = remaining();
    for (const f of files) {
      const bad = validateImageFile(f);
      if (bad) { list.append(el("li", { class: "upload-item error-text small", text: f.name + ": " + bad })); continue; }
      if (room <= 0) { list.append(el("li", { class: "upload-item error-text small", text: f.name + ": image limit reached." })); continue; }
      room--; addItem(f);
    }
  });
  return { element: el("div", { class: "uploader" }, pick, fileInput, list) };
}

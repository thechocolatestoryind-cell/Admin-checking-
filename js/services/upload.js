// Cloudinary unsigned upload. No API secret is used or needed. Never stores blob: URLs.
import { CLOUDINARY } from "../config.js";

export const IMAGE_RULES = { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 8 * 1024 * 1024, maxDimension: 6000 };

export function validateImageFile(file) {
  if (!file || !IMAGE_RULES.types.includes(file.type)) return "Use a JPG, PNG or WebP image.";
  if (!file.size) return "This file is empty.";
  if (file.size > IMAGE_RULES.maxBytes) return "Image is larger than 8 MB. Resize it and try again.";
  return null;
}
export function readDimensions(file) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(u); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(u); reject(new Error("unreadable")); };
    img.src = u;
  });
}
export function isCloudinaryUrl(u) {
  try { const x = new URL(u); return x.protocol === "https:" && /(^|\.)cloudinary\.com$/.test(x.hostname); } catch (_) { return false; }
}

// Resolves with the real https URL returned by Cloudinary. Rejects with Error(message) safe to show.
export async function uploadImage(file, onProgress) {
  const bad = validateImageFile(file); if (bad) throw new Error(bad);
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("You are offline. Connect to the internet and retry.");
  try {
    const { width, height } = await readDimensions(file);
    if (Math.max(width, height) > IMAGE_RULES.maxDimension) throw new Error("Image is larger than " + IMAGE_RULES.maxDimension + " pixels on one side. Resize it and try again.");
  } catch (e) { if (e.message !== "unreadable") throw e; throw new Error("This file could not be read as an image."); }
  return new Promise((resolve, reject) => {
    const fd = new FormData(); fd.append("file", file); fd.append("upload_preset", CLOUDINARY.uploadPreset);
    const xhr = new XMLHttpRequest(); xhr.open("POST", CLOUDINARY.uploadUrl); xhr.timeout = 90000;
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onerror = () => reject(new Error("Network error during upload. Retry when the connection is stable."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Retry on a faster connection."));
    xhr.onload = () => {
      let j = null; try { j = JSON.parse(xhr.responseText); } catch (_) {}
      if (xhr.status >= 200 && xhr.status < 300 && j && isCloudinaryUrl(j.secure_url)) resolve(j.secure_url);
      else reject(new Error("Cloudinary refused the upload" + (j && j.error && j.error.message ? ": " + String(j.error.message).slice(0, 140) : " (status " + xhr.status + ").")));
    };
    xhr.send(fd);
  });
}

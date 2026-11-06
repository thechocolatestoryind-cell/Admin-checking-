# Asset manifest
| File | Origin | Notes |
|---|---|---|
| `assets/logo.jpg` | Uploaded `132840.jpg`, byte-for-byte copy (1536x1024) | The brand logo. In the sidebar it is shown in a 2:1 frame with `object-fit: cover`, which trims only blank top/bottom margin; the full file is used on login and offline pages. |
| `assets/icon-192.png`, `icon-512.png` | Generated from the logo by resizing and padding with the logo's own near-white background | PWA icons (purpose: any) |
| `assets/icon-maskable-512.png` | Same, logo scaled to 64% width inside the safe zone | PWA maskable icon |
| `assets/apple-touch-icon.png` (180), `favicon-48.png` | Same method | The logo is wide, so it is small and letterboxed on square icons. No redesign was done. |
Palette: #2D1910, #542E1D, #9D6F51, #C9916D, #E1B797 on ivory #FBF7F1.

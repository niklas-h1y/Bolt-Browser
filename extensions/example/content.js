// Minimal Manifest V3 content-script example for Bolt desktop.
// This only runs on https://example.com/ as declared in manifest.json.
(() => {
  const badge = document.createElement("div");
  badge.textContent = "Bolt extension loaded";
  badge.style.cssText = [
    "position:fixed",
    "right:12px",
    "bottom:12px",
    "z-index:2147483647",
    "padding:8px 12px",
    "border-radius:10px",
    "background:#b8f36b",
    "color:#17200d",
    "font:12px system-ui,sans-serif",
    "box-shadow:0 4px 18px #0003"
  ].join(";");
  document.documentElement.appendChild(badge);
  setTimeout(() => badge.remove(), 3500);
})();

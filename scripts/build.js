// Builds dist/chrome and dist/firefox from src/, plus store-ready zips.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const pkg = require(path.join(ROOT, "package.json"));

const base = {
  manifest_version: 3,
  name: "PHP2Shell Site Check",
  short_name: "PHP2Shell Check",
  version: pkg.version,
  description:
    "Warns when a site's server reports a PHP version vulnerable to PHP2Shell (CVE-2026-109618/109619). Never sends requests.",
  homepage_url: "https://github.com/newtro/php2shell-site-check",
  icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
  action: {
    default_title: "PHP2Shell Site Check",
    default_popup: "popup/popup.html",
    default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png" },
  },
  permissions: ["webRequest", "webNavigation", "storage", "activeTab"],
  host_permissions: ["http://*/*", "https://*/*"],
  content_scripts: [
    { matches: ["http://*/*", "https://*/*"], js: ["content.js"], run_at: "document_idle", all_frames: false },
  ],
};

const targets = {
  chrome: { ...base, minimum_chrome_version: "116", background: { service_worker: "background.js" } },
  firefox: {
    ...base,
    background: { scripts: ["verdict.js", "background.js"] },
    browser_specific_settings: {
      gecko: {
        id: "php2shell-site-check@newtro.github.io",
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
      gecko_android: { strict_min_version: "142.0" },
    },
  },
};

fs.rmSync(DIST, { recursive: true, force: true });
for (const [name, manifest] of Object.entries(targets)) {
  const out = path.join(DIST, name);
  fs.cpSync(SRC, out, { recursive: true });
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const zip = path.join(DIST, `php2shell-site-check-${name}-${pkg.version}.zip`);
  execFileSync("zip", ["-qr", "-X", zip, "."], { cwd: out });
  console.log("built", path.relative(ROOT, out), "and", path.relative(ROOT, zip));
}

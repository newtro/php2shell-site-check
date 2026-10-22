const LABELS = {
  vulnerable: "Vulnerable PHP version",
  maybe: "Possibly vulnerable",
  unknown: "PHP, version hidden",
  patched: "Patched PHP",
  none: "No PHP detected",
};

function render(state, url, noAccess) {
  const level = state ? state.verdict.level : "none";
  document.getElementById("head").className = `level-${level}`;
  document.getElementById("label").textContent = LABELS[level];

  let host = "";
  try {
    host = new URL(url || (state && state.url)).host;
  } catch (_) {}
  document.getElementById("site").textContent = host;

  document.getElementById("reason").textContent = noAccess
    ? "The extension isn't allowed to read this site, so it can't check it. Grant access below."
    : state
    ? state.verdict.reason
    : url && /^https?:/.test(url)
      ? "No sign of PHP in this page's responses. Reload the page if it was open before the extension was installed."
      : "This extension checks regular web pages (http and https).";

  const list = document.getElementById("evidence");
  list.replaceChildren();
  const items = state ? [...state.evidence.signals, ...state.evidence.distroHints] : [];
  for (const s of new Set(items)) {
    const li = document.createElement("li");
    li.textContent = s;
    list.append(li);
  }
  document.getElementById("evidence-wrap").hidden = items.length === 0;
  document.getElementById("grant").hidden = !noAccess;
}

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return render(null, "");
  let origin = null;
  try {
    origin = new URL(tab.url).origin;
  } catch (_) {}
  // Without host access webRequest sees nothing, which would otherwise look
  // like "No PHP detected" (Chrome's "on click" site access, Firefox's
  // per-site permission toggle, enterprise policy).
  const noAccess =
    Boolean(origin) && /^https?:/.test(origin) && !(await chrome.permissions.contains({ origins: [origin + "/*"] }));
  let state = await chrome.runtime.sendMessage({ type: "getState", tabId: tab.id });
  if (state && state.origin !== origin) state = null;
  render(state, tab.url, noAccess);
  document.getElementById("grant").addEventListener("click", async () => {
    if (await chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] })) {
      await chrome.tabs.reload(tab.id);
      window.close();
    }
  });
})();

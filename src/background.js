// Watches response headers of top-level pages (and same-origin subresources)
// and records a PHP2Shell verdict per tab. Read-only: it never blocks,
// modifies, or sends any request, and nothing leaves the browser.

if (typeof PHP2Shell === "undefined" && typeof importScripts === "function") {
  importScripts("verdict.js");
}

const { analyzeResponse, mergeEvidence, classify } = PHP2Shell;

const BADGE = {
  vulnerable: { text: "!", color: "#c62828", title: "PHP2Shell: this server reports an unpatched PHP version" },
  maybe: { text: "?", color: "#ef6c00", title: "PHP2Shell: unpatched version number, possibly patched by its Linux distribution" },
  unknown: { text: "PHP", color: "#9e9d24", title: "PHP2Shell: PHP detected, version hidden" },
  patched: { text: "ok", color: "#2e7d32", title: "PHP2Shell: PHP version includes the fix" },
  none: { text: "", color: "#757575", title: "PHP2Shell: no PHP detected" },
};

// Per tab, in storage.session (survives service worker restarts):
//   tab:<id>     the committed page's state {origin, evidence, verdict}
//   pending:<id> top-level responses not yet committed, newest last. A response
//                only becomes the tab's state when its navigation commits, so
//                prerenders, downloads and 204s never replace the visible page.
//   await:<id>   a committed URL whose response hasn't arrived yet. Firefox
//                often reports the commit before the response, so the pairing
//                must work in either order.
//   seen:<id>    last state per origin, to restore pages from the back/forward
//                cache, which commit without a network response.
const PENDING_MAX = 8;
const SEEN_MAX = 20;
const k = (kind, tabId) => `${kind}:${tabId}`;
const noHash = (url) => url.split("#")[0];
const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch (_) {
    return null;
  }
};

// Event handlers for one tab run in order, so a slow storage read can't let
// an older event overwrite a newer one's result.
const queues = new Map();
function serialize(tabId, fn) {
  const prev = queues.get(tabId) || Promise.resolve();
  const next = prev.then(fn, fn).catch((e) => console.error("PHP2Shell", e));
  queues.set(tabId, next);
  next.then(() => {
    if (queues.get(tabId) === next) queues.delete(tabId);
  });
  return next;
}

async function get(kind, tabId, fallback) {
  const key = k(kind, tabId);
  const got = await chrome.storage.session.get(key);
  return got[key] === undefined ? fallback : got[key];
}

async function put(kind, tabId, value) {
  if (value === null) await chrome.storage.session.remove(k(kind, tabId));
  else await chrome.storage.session.set({ [k(kind, tabId)]: value });
}

async function setState(tabId, state) {
  await put("tab", tabId, state);
  if (state) {
    const seen = await get("seen", tabId, {});
    delete seen[state.origin];
    seen[state.origin] = state;
    const origins = Object.keys(seen);
    for (const o of origins.slice(0, Math.max(0, origins.length - SEEN_MAX))) delete seen[o];
    await put("seen", tabId, seen);
  }
  await paint(tabId, state);
}

async function paint(tabId, state) {
  const b = BADGE[state ? state.verdict.level : "none"];
  try {
    await chrome.action.setBadgeText({ tabId, text: b.text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: b.color });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ tabId, color: "#ffffff" });
    await chrome.action.setTitle({ tabId, title: b.title });
  } catch (_) {
    // Tab closed before we painted it.
  }
}

function onResponse(details) {
  if (details.tabId < 0) return;
  const found = analyzeResponse(details.responseHeaders, details.url);

  if (details.type === "main_frame") {
    serialize(details.tabId, async () => {
      const pending = await get("pending", details.tabId, []);
      pending.push({ url: noHash(details.url), evidence: mergeEvidence(null, found) });
      await put("pending", details.tabId, pending.slice(-PENDING_MAX));
      if ((await get("await", details.tabId, null)) === noHash(details.url)) await promote(details.tabId, details.url);
    });
    return;
  }

  // Same-origin XHR/fetch/frames can reveal PHP (an API endpoint, admin-ajax.php)
  // even when the HTML response hides it. Only the active document counts.
  if (details.documentLifecycle && details.documentLifecycle !== "active") return;
  if (found.versions.length === 0 && found.signals.length === 0) return;
  serialize(details.tabId, async () => {
    const state = await get("tab", details.tabId, null);
    if (!state || originOf(details.url) !== state.origin) return;
    const evidence = mergeEvidence(state.evidence, found);
    if (JSON.stringify(evidence) === JSON.stringify(state.evidence)) return;
    await setState(details.tabId, { ...state, evidence, verdict: classify(evidence) });
  });
}

const filter = { urls: ["http://*/*", "https://*/*"], types: ["main_frame", "sub_frame", "xmlhttprequest"] };
const spec = ["responseHeaders"];
// Chrome hides Set-Cookie from webRequest unless asked for extra headers.
if (chrome.webRequest.OnResponseStartedOptions && chrome.webRequest.OnResponseStartedOptions.EXTRA_HEADERS) {
  spec.push("extraHeaders");
}
chrome.webRequest.onResponseStarted.addListener(onResponse, filter, spec);

// Makes the response for `url` the tab's state once that page is the one the
// user sees. Matching is by final URL: redirects end at the committed URL, and
// a download or 204 never commits, so its pending entry is never promoted.
async function promote(tabId, url) {
  const pending = await get("pending", tabId, []);
  const target = noHash(url);
  let i = -1;
  for (let j = pending.length - 1; j >= 0 && i < 0; j--) if (pending[j].url === target) i = j;
  const origin = originOf(url);
  let state;
  if (i >= 0) {
    const evidence = pending[i].evidence;
    state = { url: target, origin, evidence, verdict: classify(evidence), at: Date.now() };
    await put("pending", tabId, pending.slice(i + 1));
    await put("await", tabId, null);
  } else {
    // The response may still be on its way (Firefox); claim it when it lands.
    await put("await", tabId, target);
    // Committed without a response we saw: back/forward cache, service
    // worker, or a same-document load. Fall back to what we knew of the origin.
    const seen = await get("seen", tabId, {});
    state = seen[origin] ? { ...seen[origin], url: target } : null;
  }
  await setState(tabId, state);
}

chrome.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId !== 0) return;
  // A prerendered page commits in the background; the content script reports
  // it once it is actually shown.
  if (d.documentLifecycle === "prerender") return;
  serialize(d.tabId, () => promote(d.tabId, d.url));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  serialize(tabId, () => chrome.storage.session.remove(["tab", "pending", "seen", "await"].map((kind) => k(kind, tabId))));
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Sent by the content script when its page becomes visible, which covers
  // prerendered pages that are activated without a new commit.
  if (msg && msg.type === "shown" && sender.tab && sender.frameId === 0 && sender.url) {
    const tabId = sender.tab.id;
    serialize(tabId, async () => {
      const state = await get("tab", tabId, null);
      if (!state || state.url !== noHash(sender.url)) await promote(tabId, sender.url);
    });
    return false;
  }
  if (!msg || msg.type !== "getState") return false;
  // Content scripts only ever get their own tab; only the popup names one.
  const tabId = sender.tab ? sender.tab.id : msg.tabId;
  if (tabId === undefined) {
    sendResponse(null);
    return false;
  }
  serialize(tabId, async () => sendResponse(await get("tab", tabId, null)));
  return true;
});

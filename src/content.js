// Shows a one-time warning when the user starts typing a password or card
// number on a page whose server reports a PHP version affected by PHP2Shell.

(() => {
  let shown = false;
  let checking = false;

  const SENSITIVE_AUTOCOMPLETE = /\b(current-password|new-password|cc-number|cc-csc|cc-exp)/i;
  // Whole-word "pass"/"pwd" so passport, passenger and compass don't match.
  const SENSITIVE_NAME = /(^|[^a-z])(pass|pwd)($|[^a-z])|password|passwd|card.?num|cc.?num|cvv|cvc|security.?code/i;

  function isSensitive(el) {
    if (!(el instanceof HTMLInputElement)) return false;
    if (el.type === "password") return true;
    if (SENSITIVE_AUTOCOMPLETE.test(el.autocomplete || "")) return true;
    return SENSITIVE_NAME.test(`${el.name || ""} ${el.id || ""}`);
  }

  function banner(state) {
    const level = state.verdict.level;
    const host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;top:0;left:0;right:0;z-index:2147483647;";
    const root = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      .bar { font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
             color: #fff; padding: 10px 44px 10px 16px; position: relative;
             box-shadow: 0 2px 8px rgba(0,0,0,.3); }
      .vulnerable { background: #b71c1c; }
      .maybe { background: #e65100; }
      strong { font-weight: 700; }
      button { position: absolute; top: 6px; right: 8px; background: transparent; border: 0;
               color: #fff; font-size: 20px; line-height: 1; cursor: pointer; padding: 4px 8px; }
    `;
    const bar = document.createElement("div");
    bar.className = `bar ${level}`;
    bar.setAttribute("role", "alert");

    const title = document.createElement("strong");
    title.textContent =
      level === "vulnerable"
        ? "Careful: this site reports an unpatched PHP version. "
        : "Heads up: this site's server may be unpatched. ";
    const body = document.createElement("span");
    body.textContent = `${state.verdict.reason} Passwords and card numbers entered here could be stolen. Avoid entering them until the site is updated.`;

    const close = document.createElement("button");
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    let dismissed = false;
    close.addEventListener("click", () => {
      dismissed = true;
      host.remove();
    });

    bar.append(title, body, close);
    root.append(style, bar);
    document.documentElement.append(host);

    // On a compromised server the attacker controls the page and could remove
    // the warning. Put it back a few times; the toolbar badge stays the
    // signal the page can't touch.
    let restores = 0;
    new MutationObserver((_, obs) => {
      if (dismissed || host.isConnected) return;
      if (++restores > 5) return obs.disconnect();
      document.documentElement.append(host);
    }).observe(document, { childList: true, subtree: true });
  }

  document.addEventListener(
    "focusin",
    async (e) => {
      // composedPath reaches inputs inside web components' shadow roots.
      const target = e.composedPath ? e.composedPath()[0] : e.target;
      if (shown || checking || !isSensitive(target)) return;
      checking = true;
      let state = null;
      try {
        state = await chrome.runtime.sendMessage({ type: "getState" });
      } catch (_) {
        // Extension was reloaded or updated; nothing to show.
      }
      checking = false;
      // Not settled yet (evidence can arrive later from an API call): check
      // again on the next focus rather than giving up for the page.
      if (!state || (state.verdict.level !== "vulnerable" && state.verdict.level !== "maybe")) return;
      // Only warn if the verdict belongs to this page's server.
      if (state.origin !== location.origin) return;
      shown = true;
      banner(state);
    },
    true
  );

  // Tell the background which page is showing. Needed for prerendered pages,
  // which are activated without a fresh navigation commit.
  const report = () => chrome.runtime.sendMessage({ type: "shown" }).catch(() => {});
  if (document.prerendering) document.addEventListener("prerenderingchange", report, { once: true });
  else report();
})();

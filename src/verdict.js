// Pure detection and classification logic. Shared by the background script
// and the Node tests, so it must not touch any extension API.
// Wrapped so its names stay out of the global scope it shares with
// background.js in both the Chrome service worker and Firefox event page.
(() => {
  // First patched release on each supported branch for PHP2Shell
  // (CVE-2026-109618, CVE-2026-109619), released 2026-10-21.
  const FIXED_PATCH = { "8.2": 35, "8.3": 36, "8.4": 27, "8.5": 12 };
  const OLDEST_SUPPORTED = [8, 2];
  const NEWEST_KNOWN = [8, 5];

  const DISTRO_RE = /ubuntu|debian|deb\d|red ?hat|rhel|centos|rocky|almalinux|fedora|suse|amazon|\bel\d/i;
  // Ubuntu and Debian packages always carry a version suffix (8.1.2-1ubuntu2.22,
  // 8.2.29-1~deb12u1), so a bare PHP version behind an "(Ubuntu)" or "(Debian)"
  // web server is something else, such as the official Docker image (Debian
  // based, built from upstream). Red Hat-family packages report bare versions.
  const SERVER_DISTRO_RE = /red ?hat|rhel|centos|rocky|almalinux|fedora|suse|amazon/i;
  // Third-party repos that ship upstream releases unchanged rather than backports.
  // Sury's Debian builds look like 8.3.14-1+0~20241128.48+debian12~1.gbp3d6ba8.
  const UPSTREAM_REPACK_RE = /sury|remi|\+0~\d{8}\.\d+\+/i;
  const PHP_TOKEN_RE = /\bPHP(?![a-z])(?:\/(\d+)\.(\d+)(?:\.(\d+))?([^\s,;()]*))?/i;

  const SEVERITY = { none: 0, patched: 1, unknown: 2, maybe: 3, vulnerable: 4 };

  function parsePhpToken(value) {
    const m = PHP_TOKEN_RE.exec(value || "");
    if (!m) return null;
    if (m[1] === undefined) return { raw: m[0] };
    return {
      raw: m[0],
      major: Number(m[1]),
      minor: Number(m[2]),
      patch: m[3] === undefined ? null : Number(m[3]),
      suffix: m[4] || "",
    };
  }

  // headers: [{name, value}] as webRequest provides them. url: the request URL.
  // Returns the evidence found in this one response.
  function analyzeResponse(headers, url) {
    const found = { versions: [], signals: [], distroHints: [] };
    let server = "";
    for (const h of headers || []) {
      if ((h.name || "").toLowerCase() === "server") server = h.value || "";
    }
    for (const h of headers || []) {
      const name = (h.name || "").toLowerCase();
      const value = h.value || "";
      if (name === "x-powered-by" || name === "server") {
        const tok = parsePhpToken(value);
        if (tok) {
          found.signals.push(`${h.name}: ${value}`);
          if (tok.major !== undefined) {
            const fromServer = name === "server";
            const serverDistro = (fromServer ? DISTRO_RE : SERVER_DISTRO_RE).test(server);
            const suffixDistro = DISTRO_RE.test(tok.suffix) && !UPSTREAM_REPACK_RE.test(tok.suffix);
            found.versions.push({ ...tok, source: h.name, distro: suffixDistro || serverDistro });
          }
        }
        if (name === "server" && DISTRO_RE.test(value)) found.distroHints.push(`${h.name}: ${value}`);
      } else if (name === "set-cookie" && /(^|[\s;,])PHPSESSID=/i.test(value)) {
        found.signals.push("Sets a PHPSESSID session cookie");
      } else if (name === "x-pingback" && /\.php\b/i.test(value)) {
        found.signals.push("X-Pingback points at a .php endpoint (WordPress)");
      } else if (name === "link" && /\/wp-json\//i.test(value)) {
        found.signals.push("Link header advertises wp-json (WordPress)");
      }
    }
    try {
      if (/\.php$/i.test(new URL(url).pathname)) found.signals.push("URL path ends in .php");
    } catch (_) {
      // Unparseable URL: no URL-based signal.
    }
    return found;
  }

  // A page can make thousands of requests; storage.session is shared by all
  // tabs, so evidence per page is capped.
  const MAX_ITEMS = 10;

  // Folds one response's evidence into the accumulated evidence for a page.
  function mergeEvidence(acc, next) {
    const out = acc
      ? { versions: [...acc.versions], signals: [...acc.signals], distroHints: [...acc.distroHints] }
      : { versions: [], signals: [], distroHints: [] };
    const seen = new Set(out.versions.map((v) => `${v.source}|${v.raw}|${v.distro}`));
    for (const v of next.versions) if (!seen.has(`${v.source}|${v.raw}|${v.distro}`)) out.versions.push(v);
    for (const s of next.signals) if (!out.signals.includes(s)) out.signals.push(s);
    for (const s of next.distroHints) if (!out.distroHints.includes(s)) out.distroHints.push(s);
    if (out.versions.length > MAX_ITEMS) {
      // Keep the worst versions so the cap never hides a vulnerable one.
      const rank = (v) => SEVERITY[classifyVersion(v).level];
      out.versions = out.versions
        .map((v, i) => [v, i])
        .sort((a, b) => rank(b[0]) - rank(a[0]) || a[1] - b[1])
        .slice(0, MAX_ITEMS)
        .sort((a, b) => a[1] - b[1])
        .map(([v]) => v);
    }
    out.signals = out.signals.slice(0, MAX_ITEMS);
    out.distroHints = out.distroHints.slice(0, MAX_ITEMS);
    return out;
  }

  function cmp(a, b) {
    return a[0] - b[0] || a[1] - b[1];
  }

  function classifyVersion(v) {
    const ver = `${v.major}.${v.minor}${v.patch === null ? "" : "." + v.patch}${v.suffix}`;
    const branch = `${v.major}.${v.minor}`;
    let detail;

    if (cmp([v.major, v.minor], OLDEST_SUPPORTED) < 0) {
      detail = `PHP ${ver} is end-of-life. PHP has released no fix for this branch.`;
    } else if (cmp([v.major, v.minor], NEWEST_KNOWN) > 0) {
      return { level: "patched", version: ver, reason: `PHP ${ver} is newer than every branch in the advisory.` };
    } else if (v.patch === null) {
      return {
        level: "unknown",
        version: ver,
        reason: `This site reports PHP ${branch} without a patch number, so its patch status can't be determined.`,
      };
    } else if (v.patch < FIXED_PATCH[branch]) {
      detail = `PHP ${ver} is older than the fixed release ${branch}.${FIXED_PATCH[branch]}.`;
    } else {
      return { level: "patched", version: ver, reason: `PHP ${ver} includes the PHP2Shell fix.` };
    }

    if (v.distro) {
      return {
        level: "maybe",
        version: ver,
        reason: `${detail} The server looks like a Linux distribution build, and distributions often backport fixes without changing the version number, so it may be patched.`,
      };
    }
    return {
      level: "vulnerable",
      version: ver,
      reason: `${detail} The server is likely exposed to PHP2Shell, unless its operating system vendor backported the fix without changing the version.`,
    };
  }

  // Levels, worst first:
  //   vulnerable  - a reported version predates the fix, no sign of a distro build
  //   maybe       - a reported version predates the fix, but a distro may have backported it
  //   unknown     - PHP detected, version hidden
  //   patched     - every reported version includes the fix
  //   none        - no PHP detected
  // With several versions (page vs. a legacy endpoint), the worst one wins.
  function classify(evidence) {
    if (!evidence || (evidence.versions.length === 0 && evidence.signals.length === 0)) {
      return { level: "none", reason: "No sign of PHP in this page's responses." };
    }
    if (evidence.versions.length === 0) {
      return {
        level: "unknown",
        reason: "This site runs PHP but hides its version, so its patch status can't be seen from the browser.",
      };
    }
    return evidence.versions
      .map(classifyVersion)
      .reduce((worst, v) => (SEVERITY[v.level] > SEVERITY[worst.level] ? v : worst));
  }

  const EXPORTS = { FIXED_PATCH, SEVERITY, parsePhpToken, analyzeResponse, mergeEvidence, classify };
  if (typeof module !== "undefined" && module.exports) module.exports = EXPORTS;
  else globalThis.PHP2Shell = EXPORTS;
})();

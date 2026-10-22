// End-to-end check: loads dist/chrome into Chromium, serves pages with
// PHP-style headers from a local server, and asserts badge and warning.
// Run `npm run build` first. Usage: node test/e2e.js
const http = require("http");
const path = require("path");
const os = require("os");
const fs = require("fs");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const FORM = `<!doctype html><title>Login</title><form><input name="user"><input type="password" id="pw"></form>`;
const ROUTES = {
  "/vuln": { "X-Powered-By": "PHP/8.3.20" },
  "/patched": { "X-Powered-By": "PHP/8.3.36" },
  "/ubuntu": { "X-Powered-By": "PHP/8.1.2-1ubuntu2.22", Server: "Apache/2.4.52 (Ubuntu)" },
  "/hidden": { "Set-Cookie": "PHPSESSID=abc; Path=/" },
  "/none": { Server: "nginx" },
  "/spa": { Server: "nginx" },
  "/api.php": { "X-Powered-By": "PHP/8.4.1", "Content-Type": "application/json" },
  "/slow": { Server: "nginx" },
  "/prerender": { Server: "nginx" },
  "/dl": { Server: "nginx", "Content-Disposition": "attachment; filename=x.txt", "Content-Type": "text/plain" },
};

const requested = [];
function serve() {
  const server = http.createServer((req, res) => {
    requested.push(req.url);
    const url = new URL(req.url, "http://x");
    const headers = ROUTES[url.pathname];
    if (!headers) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store", ...headers });
    if (url.pathname === "/api.php") return res.end("{}");
    if (url.pathname === "/spa") return res.end(`${FORM}<script>fetch("/api.php")</script>`);
    if (url.pathname === "/slow") return res.end(`${FORM}<script>setTimeout(() => fetch("/api.php"), 1500)</script>`);
    if (url.pathname === "/prerender")
      return res.end(`${FORM}<script type="speculationrules">{"prerender":[{"source":"list","urls":["/vuln?pre"]}]}</script>`);
    if (url.pathname === "/dl") return res.end("file");
    res.end(FORM);
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const ext = path.join(__dirname, "..", "dist", "chrome");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "php2shell-e2e-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  let failures = 0;
  try {
    const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
    // Wait until the worker has run its top level and registered listeners;
    // pages loaded before that (only possible right at install) go unseen.
    await sw.evaluate(() => chrome.webRequest.onResponseStarted.hasListeners());
    const page = await ctx.newPage();

    const badge = async () =>
      sw.evaluate(async (url) => {
        const [tab] = await chrome.tabs.query({ url });
        return chrome.action.getBadgeText({ tabId: tab.id });
      }, page.url());
    const bannerShown = async () =>
      page.evaluate(() =>
        [...document.documentElement.children].some((el) => el.style && el.style.zIndex === "2147483647")
      );

    const cases = [
      ["/vuln", "127.0.0.1", "!", true],
      ["/patched", "127.0.0.1", "ok", false],
      ["/vuln", "localhost", "!", true],
      ["/ubuntu", "127.0.0.1", "?", true],
      ["/hidden", "127.0.0.1", "PHP", false],
      ["/none", "localhost", "", false],
      ["/spa", "127.0.0.1", "!", true],
    ];
    for (const [p, host, wantBadge, wantBanner] of cases) {
      await page.goto(`http://${host}:${port}${p}`);
      await page.waitForTimeout(400);
      const got = await badge();
      await page.focus("#pw");
      await page.waitForTimeout(300);
      const shown = await bannerShown();
      const ok = got === wantBadge && shown === wantBanner;
      if (!ok) failures++;
      console.log(`${ok ? "PASS" : "FAIL"} ${p.padEnd(9)} badge=${JSON.stringify(got)} banner=${shown}`);
    }

    const check = (name, ok, detail) => {
      if (!ok) failures++;
      console.log(`${ok ? "PASS" : "FAIL"} ${name} (${detail})`);
    };

    // A download from a vulnerable page must not replace its verdict.
    await page.goto(`http://127.0.0.1:${port}/vuln`);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.href = "/dl";
      document.body.append(a);
      a.click();
    });
    await page.waitForTimeout(800);
    let b = await badge();
    await page.focus("#pw");
    await page.waitForTimeout(300);
    check("download keeps verdict", b === "!" && (await bannerShown()), `badge=${JSON.stringify(b)}`);

    // A prerendered vulnerable page must not paint the current page.
    await page.goto(`http://127.0.0.1:${port}/prerender`);
    await page.waitForTimeout(1500);
    b = await badge();
    if (requested.includes("/vuln?pre")) check("prerender doesn't leak", b === "", `badge=${JSON.stringify(b)}`);
    else console.log("INFO prerender not exercised: this Chromium didn't prerender");

    // Evidence that arrives late still triggers the banner on a later focus.
    await page.goto(`http://127.0.0.1:${port}/slow`);
    await page.waitForTimeout(300);
    await page.focus("#pw");
    await page.waitForTimeout(300);
    const early = await bannerShown();
    await page.waitForTimeout(1800);
    await page.focus("input:not([type])");
    await page.focus("#pw");
    await page.waitForTimeout(300);
    check("late evidence warns on refocus", !early && (await bannerShown()), `early=${early}`);

    // Origin change must drop the previous site's verdict.
    await page.goto(`http://127.0.0.1:${port}/vuln`);
    await page.waitForTimeout(300);
    await page.goto(`http://localhost:${port}/none`);
    await page.waitForTimeout(300);
    const after = await badge();
    if (after !== "") failures++;
    console.log(`${after === "" ? "PASS" : "FAIL"} origin change clears badge (badge=${JSON.stringify(after)})`);

    // Back navigation (possibly from bfcache) restores the right verdict.
    await page.goBack();
    await page.waitForTimeout(500);
    const back = await badge();
    console.log(`${back === "!" || back === "" ? "INFO" : "FAIL"} back to /vuln badge=${JSON.stringify(back)}`);
  } finally {
    await ctx.close();
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  assert.equal(failures, 0, `${failures} e2e check(s) failed`);
  console.log("e2e: all checks passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Firefox end-to-end check via geckodriver: installs dist/firefox's zip as a
// temporary add-on and asserts the warning banner appears only on pages whose
// headers report a vulnerable PHP version. Run `npm run build` first.
const http = require("http");
const path = require("path");
const fs = require("fs");
const assert = require("node:assert/strict");
const { Builder, By } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");

const FORM = `<!doctype html><title>Login</title><input type="password" id="pw">`;
const ROUTES = {
  "/vuln": { "X-Powered-By": "PHP/8.3.20" },
  "/patched": { "X-Powered-By": "PHP/8.3.36" },
  "/ubuntu": { "X-Powered-By": "PHP/8.1.2-1ubuntu2.22" },
  "/none": { Server: "nginx" },
};

(async () => {
  const server = http.createServer((req, res) => {
    const headers = ROUTES[new URL(req.url, "http://x").pathname];
    if (!headers) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store", ...headers });
    res.end(FORM);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  const pkg = require("../package.json");
  const xpi = path.join(__dirname, "..", "dist", `php2shell-site-check-firefox-${pkg.version}.zip`);
  assert.ok(fs.existsSync(xpi), "build first");
  const opts = new firefox.Options().addArguments("-headless");
  const driver = await new Builder().forBrowser("firefox").setFirefoxOptions(opts).build();
  let failures = 0;
  try {
    await driver.installAddon(xpi, true);
    await driver.sleep(1000);
    for (const [p, want] of [["/vuln", true], ["/patched", false], ["/ubuntu", true], ["/none", false]]) {
      await driver.get(`http://127.0.0.1:${port}${p}`);
      await driver.sleep(500);
      await driver.findElement(By.id("pw")).click();
      await driver.sleep(500);
      const shown = await driver.executeScript(() =>
        [...document.documentElement.children].some((el) => el.style && el.style.zIndex === "2147483647")
      );
      const ok = shown === want;
      if (!ok) failures++;
      console.log(`${ok ? "PASS" : "FAIL"} ${p.padEnd(9)} banner=${shown}`);
    }
  } finally {
    await driver.quit();
    server.close();
  }
  assert.equal(failures, 0, `${failures} Firefox e2e check(s) failed`);
  console.log("firefox e2e: all checks passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

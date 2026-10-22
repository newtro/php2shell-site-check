const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeResponse, mergeEvidence, classify } = require("../src/verdict.js");

const h = (pairs) => Object.entries(pairs).map(([name, value]) => ({ name, value }));
const level = (headers, url = "https://example.com/") =>
  classify(mergeEvidence(null, analyzeResponse(h(headers), url))).level;

test("versions below each branch's fix are vulnerable", () => {
  assert.equal(level({ "X-Powered-By": "PHP/8.5.11" }), "vulnerable");
  assert.equal(level({ "X-Powered-By": "PHP/8.4.26" }), "vulnerable");
  assert.equal(level({ "X-Powered-By": "PHP/8.3.35" }), "vulnerable");
  assert.equal(level({ "X-Powered-By": "PHP/8.2.0" }), "vulnerable");
});

test("fixed releases and later are patched", () => {
  assert.equal(level({ "X-Powered-By": "PHP/8.5.12" }), "patched");
  assert.equal(level({ "X-Powered-By": "PHP/8.4.27" }), "patched");
  assert.equal(level({ "X-Powered-By": "PHP/8.3.40" }), "patched");
  assert.equal(level({ "X-Powered-By": "PHP/8.2.35" }), "patched");
  assert.equal(level({ "X-Powered-By": "PHP/8.6.0" }), "patched");
  assert.equal(level({ "X-Powered-By": "PHP/9.0.1" }), "patched");
});

test("end-of-life branches are vulnerable", () => {
  assert.equal(level({ "X-Powered-By": "PHP/8.1.33" }), "vulnerable");
  assert.equal(level({ "X-Powered-By": "PHP/7.4.33" }), "vulnerable");
  assert.equal(level({ "X-Powered-By": "PHP/5.6.40" }), "vulnerable");
});

test("distribution builds are downgraded to maybe", () => {
  assert.equal(level({ "X-Powered-By": "PHP/8.1.2-1ubuntu2.22" }), "maybe");
  assert.equal(level({ "X-Powered-By": "PHP/8.2.29-1~deb12u1" }), "maybe");
  assert.equal(level({ "X-Powered-By": "PHP/8.2.13", Server: "Apache/2.4.57 (Red Hat Enterprise Linux)" }), "maybe");
  assert.equal(level({ "X-Powered-By": "PHP/8.0.30", Server: "Apache/2.4.37 (AlmaLinux) OpenSSL/1.1.1k" }), "maybe");
  assert.equal(level({ Server: "Apache/2.4.41 (Ubuntu) PHP/7.4.3" }), "maybe");
});

test("Server header carries the version when X-Powered-By is absent", () => {
  assert.equal(level({ Server: "Apache/2.4.62 (Unix) PHP/8.3.20" }), "vulnerable");
});

test("PHP without a version is unknown", () => {
  assert.equal(level({ "Set-Cookie": "PHPSESSID=abc123; path=/" }), "unknown");
  assert.equal(level({ "X-Pingback": "https://example.com/xmlrpc.php" }), "unknown");
  assert.equal(level({ Link: '<https://example.com/wp-json/>; rel="https://api.w.org/"' }), "unknown");
  assert.equal(level({}, "https://example.com/index.php"), "unknown");
  assert.equal(level({ "X-Powered-By": "PHP/8.3" }), "unknown");
});

test("no PHP signals means none", () => {
  assert.equal(level({ Server: "nginx", "X-Powered-By": "Express" }), "none");
  assert.equal(level({ "Set-Cookie": "session=abc" }), "none");
  assert.equal(level({}, "https://example.com/php-guide"), "none");
});

test("non-PHP tokens that contain 'php' are ignored", () => {
  assert.equal(level({ "X-Powered-By": "PHPExpress-Clone" }), "none");
  assert.equal(level({ Server: "phpmyfake" }), "none");
});

test("upstream repacks and Docker images are not treated as distro backports", () => {
  assert.equal(level({ "X-Powered-By": "PHP/8.3.20-1+ubuntu22.04.1+deb.sury.org+1" }), "vulnerable");
  // Official php:8.3-fpm image behind the host's Ubuntu nginx.
  assert.equal(level({ "X-Powered-By": "PHP/8.3.20", Server: "nginx/1.18.0 (Ubuntu)" }), "vulnerable");
  // Official php:8.3-apache image (Debian based, upstream build).
  assert.equal(level({ "X-Powered-By": "PHP/8.3.20", Server: "Apache/2.4.62 (Debian)" }), "vulnerable");
  assert.equal(level({ "X-Powered-By": "PHP/8.3.14-1+0~20241128.48+debian12~1.gbp3d6ba8" }), "vulnerable");
});

test("RHEL builds behind a bare Server header can't be recognized (known limit)", () => {
  const v = classify(mergeEvidence(null, analyzeResponse(h({ "X-Powered-By": "PHP/8.2.13", Server: "nginx/1.20.1" }), "https://a.test/")));
  assert.equal(v.level, "vulnerable");
  assert.match(v.reason, /unless its operating system vendor backported/);
});

test("merge adds later signals and the worst version wins", () => {
  let ev = mergeEvidence(null, analyzeResponse(h({ "Set-Cookie": "PHPSESSID=1" }), "https://a.test/"));
  assert.equal(classify(ev).level, "unknown");
  ev = mergeEvidence(ev, analyzeResponse(h({ "X-Powered-By": "PHP/8.4.30" }), "https://a.test/x"));
  assert.equal(classify(ev).level, "patched");
  ev = mergeEvidence(ev, analyzeResponse(h({ "X-Powered-By": "PHP/7.4.3" }), "https://a.test/legacy/x.php"));
  assert.equal(classify(ev).level, "vulnerable");
  assert.equal(classify(ev).version, "7.4.3");
});

test("evidence is capped but the worst version survives", () => {
  let ev = mergeEvidence(null, analyzeResponse(h({ "X-Powered-By": "PHP/7.4.3" }), "https://a.test/"));
  for (let i = 0; i < 50; i++) {
    ev = mergeEvidence(ev, analyzeResponse(h({ "X-Powered-By": `PHP/8.5.${20 + i}`, Server: `s${i}` }), "https://a.test/x"));
  }
  assert.ok(ev.versions.length <= 10 && ev.signals.length <= 10);
  assert.equal(classify(ev).version, "7.4.3");
});

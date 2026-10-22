// Renders store screenshots (1280x800) of the popup and in-page warning,
// using the real popup.html/css/js with a stubbed extension API.
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "store");
const { analyzeResponse, mergeEvidence, classify } = require("../src/verdict.js");

function stateFor(url, headers) {
  const ev = mergeEvidence(null, analyzeResponse(Object.entries(headers).map(([name, value]) => ({ name, value })), url));
  return { url, origin: new URL(url).origin, evidence: ev, verdict: classify(ev) };
}

const SCENES = [
  ["vulnerable", "https://shop.example.com/login", { "X-Powered-By": "PHP/8.3.20", "Set-Cookie": "PHPSESSID=…" }, true],
  ["maybe", "https://blog.example.org/wp-login.php", { "X-Powered-By": "PHP/8.1.2-1ubuntu2.22", Server: "Apache/2.4.52 (Ubuntu)" }, true],
  ["patched", "https://news.example.net/", { "X-Powered-By": "PHP/8.4.27" }, false],
];

const css = fs.readFileSync(path.join(ROOT, "src/popup/popup.css"), "utf8");
const popupBody = fs.readFileSync(path.join(ROOT, "src/popup/popup.html"), "utf8").match(/<body>([\s\S]*)<script/)[1];
const popupJs = fs.readFileSync(path.join(ROOT, "src/popup/popup.js"), "utf8");

function page(state, banner) {
  const stub = `window.chrome={tabs:{query:async()=>[{id:1,url:${JSON.stringify(state.url)}}]},runtime:{sendMessage:async()=>(${JSON.stringify(state)})}};`;
  const bannerHtml = banner
    ? `<div class="warn ${state.verdict.level}"><strong>${state.verdict.level === "vulnerable" ? "Careful: this site reports an unpatched PHP version." : "Heads up: this site's server may be unpatched."}</strong> ${state.verdict.reason} Passwords and card numbers entered here could be stolen.</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;width:1280px;height:800px;background:#e9eaee;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow:hidden}
    .chrome{height:44px;background:#dfe1e5;display:flex;align-items:center;padding:0 16px;gap:12px}
    .url{flex:1;background:#fff;border-radius:16px;padding:6px 14px;font-size:14px;color:#333}
    .icon{width:28px;height:28px;position:relative}.icon img{width:28px}
    .badge{position:absolute;right:-8px;bottom:-4px;color:#fff;font:700 10px sans-serif;padding:1px 4px;border-radius:6px}
    .site{position:absolute;top:44px;left:0;right:0;bottom:0;background:#fff}
    .warn{color:#fff;padding:12px 16px;font-size:15px;line-height:1.4}.warn.vulnerable{background:#b71c1c}.warn.maybe{background:#e65100}
    .login{width:360px;margin:110px 0 0 200px}.login h1{font-size:26px}.login input{display:block;width:100%;padding:10px;margin:10px 0;font-size:16px;border:1px solid #bbb;border-radius:6px;box-sizing:border-box}
    .login input:focus{outline:2px solid #4f5b93}
    .popup{position:absolute;top:50px;right:16px;box-shadow:0 8px 28px rgba(0,0,0,.28);border-radius:8px;overflow:hidden;background:#fff}
    .popup-inner{all:initial;display:block}
  </style></head><body>
  <div class="chrome"><div class="url">${state.url}</div><div class="icon"><img src="file://${ROOT}/src/icons/icon-128.png"><span class="badge" id="b"></span></div></div>
  <div class="site">${bannerHtml}<div class="login"><h1>Sign in</h1><input placeholder="Email"><input type="password" placeholder="Password" autofocus></div></div>
  <div class="popup"><iframe id="pf" style="border:0;width:360px;height:520px;display:block"></iframe></div>
  <script>
    const B={vulnerable:["!","#c62828"],maybe:["?","#ef6c00"],unknown:["PHP","#9e9d24"],patched:["ok","#2e7d32"]}[${JSON.stringify(state.verdict.level)}];
    const b=document.getElementById("b");b.textContent=B[0];b.style.background=B[1];
    const doc=document.getElementById("pf").contentDocument;
    doc.open();doc.write(${JSON.stringify(`<!doctype html><html><head><style>${css}</style></head><body>`)}+${JSON.stringify(popupBody)}+"<script>"+${JSON.stringify(stub)}+${JSON.stringify(popupJs)}+"<\\/script></body></html>");doc.close();
  </script></body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  for (const [name, url, headers, banner] of SCENES) {
    const file = path.join(OUT, `tmp-${name}.html`);
    fs.writeFileSync(file, page(stateFor(url, headers), banner));
    await p.goto("file://" + file);
    await p.waitForTimeout(400);
    await p.evaluate(() => {
      const f = document.getElementById("pf");
      f.style.height = f.contentDocument.body.scrollHeight + "px";
    });
    await p.screenshot({ path: path.join(OUT, `screenshot-${name}.png`) });
    fs.rmSync(file);
  }
  await browser.close();
  console.log("screenshots written to", OUT);
})();

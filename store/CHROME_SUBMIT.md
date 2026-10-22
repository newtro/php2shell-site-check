# Chrome Web Store submission, step by step

Everything to paste is in a code block below, so you never have to leave this page.
Files are in `/Volumes/Cache/repos/SecurityAudit`.

## 0. Open the dashboard
Open https://chrome.google.com/webstore/devconsole in Brave or Chrome, signed in as sesmith2k@gmail.com.
If it asks you to register, pay the one-time $5 fee and verify your contact email first.

## 1. Upload the package
1. Open the existing draft item `kkpgampikonaiekpmoabbmffnkbbplaj` (do not create a duplicate). Use **Package** to upload a replacement ZIP.
2. Upload `dist/php2shell-site-check-chrome-1.0.0.zip`.
3. You land on the item's **Store listing** tab.

## 2. Store listing tab
**Description:**
```
PHP2Shell (CVE-2026-109618 and CVE-2026-109619) is a pair of critical flaws in the PHP interpreter, disclosed on 21 October 2026. These flaws can allow unauthenticated remote code execution on affected PHP deployments. A compromised server can steal what visitors type into it, such as passwords and card numbers, and can serve them malware. Many site owners will be slow to patch.

PHP2Shell Site Check tells you when the site you're on looks unpatched:

• Red "!" badge: the server reports a PHP version older than the fix (8.5.12, 8.4.27, 8.3.36, 8.2.35), or an end-of-life branch with no fix.
• Orange "?" badge: the version predates the fix, but it looks like a Linux distribution build that may have backported the fix.
• "PHP" badge: the site runs PHP but hides its version.
• Green "ok" badge: the reported version includes the fix.

On red and orange sites you get a one-time warning when you start typing into a password or card-number field. The popup shows exactly which headers led to the verdict.

How it works: the extension only reads the response headers your browser already receives. It never sends requests of its own and never probes servers. It processes page addresses, response-header evidence, and sensitive-field focus only on your device to provide the check. It never reads typed form values or transmits this data to the developer or third parties. Tab evidence stays in browser session memory until the tab closes or the browser exits. It makes no network connections of its own. Many sites hide their PHP version, so treat the result as a hint, not proof.

Open source (MIT): https://github.com/newtro/php2shell-site-check
```
- **Category:** Privacy & Security
- **Language:** English
- **Store icon:** upload `src/icons/icon-128.png`
- **Screenshots:** upload `store/screenshot-vulnerable.png`, `store/screenshot-maybe.png`, `store/screenshot-patched.png`
- **Homepage URL:** `https://github.com/newtro/php2shell-site-check`
- **Support URL:** `https://github.com/newtro/php2shell-site-check/issues`
- Leave the promo tiles empty (they're optional).
- Click **Save draft**.

## 3. Privacy tab
**Single purpose description:**
```
Warn the user when the website they are visiting is served by a PHP version vulnerable to PHP2Shell, based on the response headers the browser already received.
```
**webRequest justification:**
```
Read response headers (X-Powered-By, Server, the PHPSESSID cookie-name signal, X-Pingback and Link) of pages the user visits to detect the PHP version. Observational only; requests are never blocked or modified.
```
**webNavigation justification:**
```
Detect when a tab moves to a different page or site, including back/forward cache navigations that carry no headers, so a previous site's verdict is never shown for the wrong page.
```
**storage justification:**
```
Keep each tab's verdict in session storage while the tab is open. Cleared when the tab closes or the browser exits.
```
**activeTab justification:**
```
Lets the popup read the current tab's address to show which site the verdict is for.
```
**Host permission justification:**
```
Needed to read response headers on every site the user visits and to show the password-field warning on affected sites. The vulnerability can affect any PHP website, so the check cannot be limited to a list of sites.
```
- **Are you using remote code?** No, I am not using remote code.
- **Data usage:** select Web history, User activity, and Website content for local processing of page addresses, response monitoring, sensitive-field focus and selected header/input evidence. No typed form values or cookie values are retained; no user data is transmitted to the developer or third parties. Tick all three certification boxes (not sold or transferred, not used for unrelated purposes, not used for creditworthiness). Google requires disclosure even for local processing: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- **Privacy policy URL:**
```
https://github.com/newtro/php2shell-site-check/blob/main/PRIVACY.md
```
- Click **Save draft**.

## 4. Distribution tab
- **Payments:** Free
- **Visibility:** Public
- **Regions:** All regions
- Click **Save draft**.

## 5. Submit
1. Click **Submit for review**. If the button is greyed out, the left sidebar marks the tab that still has a missing field.
2. Confirm. Review usually takes 1–3 days, sometimes longer when broad host permissions are requested.
3. Copy the item ID from the URL (32 letters) and send it to Claude so the README can link the listing.

# Store listing copy

## Name
PHP2Shell Site Check

## Summary (132 chars max)
Warns when a site's server reports a PHP version vulnerable to PHP2Shell (CVE-2026-109618/109619). Never sends requests.

## Category
Chrome: Privacy & Security · Firefox: Privacy & Security

## Description
PHP2Shell (CVE-2026-109618 and CVE-2026-109619) is a pair of critical flaws in the PHP interpreter, disclosed on 21 October 2026. A single unauthenticated request can let an attacker take over the web server. A compromised server can steal what visitors type into it, such as passwords and card numbers, and can serve them malware. Many site owners will be slow to patch.

PHP2Shell Site Check tells you when the site you're on looks unpatched:

• Red "!" badge: the server reports a PHP version older than the fix (8.5.12, 8.4.27, 8.3.36, 8.2.35), or an end-of-life branch with no fix.
• Orange "?" badge: the version predates the fix, but it looks like a Linux distribution build that may have backported the fix.
• "PHP" badge: the site runs PHP but hides its version.
• Green "ok" badge: the reported version includes the fix.

On red and orange sites you get a one-time warning when you start typing into a password or card-number field. The popup shows exactly which headers led to the verdict.

How it works: the extension only reads the response headers your browser already receives. It never sends requests of its own and never probes servers. It collects no data and makes no network connections. Many sites hide their PHP version, so treat the result as a hint, not proof.

Open source (MIT): https://github.com/newtro/php2shell-site-check

## Single purpose (Chrome)
Warn the user when the website they are visiting is served by a PHP version vulnerable to PHP2Shell, based on the response headers the browser already received.

## Permission justifications (Chrome)
- webRequest: Read response headers (X-Powered-By, Server, Set-Cookie name only) of pages the user visits to detect the PHP version. Observational only; requests are never blocked or modified.
- activeTab: Lets the popup see the current tab's address to show which site the verdict is for.
- webNavigation: Detect when a tab moves to a different site, including back/forward cache navigations that carry no headers, so a previous site's verdict is cleared.
- storage: Keep each tab's verdict in session storage while the tab is open. Cleared when the tab closes.
- Host permissions (http://*/*, https://*/*): Needed to read response headers on every site the user visits and to show the password-field warning on affected sites. The vulnerability can affect any site.
- Remote code: No. All code is in the package.

## Data usage (Chrome)
Collects none of the listed data types. Certify: not sold, not used for unrelated purposes, not used for creditworthiness.

## Privacy policy URL
https://github.com/newtro/php2shell-site-check/blob/main/PRIVACY.md

## Firefox
- Data collection: none (declared in manifest).
- Source code submission: not required (no minification or bundling); the zip is the source.
- License: MIT.

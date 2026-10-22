# Privacy policy: PHP2Shell Site Check

Last updated: 22 October 2026

PHP2Shell Site Check processes browsing data only on your device to detect reported PHP versions and warn about potentially affected sites. It does not transmit user data to the developer or any third party, sell it, or use it for advertising or analytics.

- **What it processes:** the current page address and origin; HTTP response headers already received by the browser for top-level pages and same-origin frame/API requests; and whether a password or payment-related input receives focus. The input's type, autocomplete, name and ID are inspected to identify sensitive fields. Typed form values, passwords and card numbers are never read.
- **Header evidence:** it examines X-Powered-By and Server for PHP/version and distribution signals, X-Pingback and Link for PHP/WordPress signals, and the URL path for a .php suffix. The browser also supplies Set-Cookie headers; the extension checks for the PHPSESSID cookie name as a PHP signal and does not retain cookie values.
- **Purpose and categories:** page addresses and per-tab evidence are local web-history data; response monitoring and input-focus detection are local user activity; selected response-header evidence and input attributes are website content. They are used only to provide the extension's badge, popup and warning.
- **Storage and deletion:** each tab's page address, verdict, selected header evidence and recent origin verdicts are kept in the browser's in-memory session storage to survive service-worker restarts and restore navigation state. They are removed when the tab closes or the browser exits. Input-focus detection is not logged or retained as a history.
- **Network and third parties:** the extension sends no requests or probes and makes no network connections of its own. It has no analytics, telemetry, remote code, accounts or external data recipients. If you choose an external source link in the popup, the browser opens that website normally.
- **Limited use:** the extension complies with the Chrome Web Store User Data Policy, including its Limited Use requirements. It uses data only for its stated security-check purpose, never sells or transfers it to third parties, never uses it for unrelated purposes, advertising, creditworthiness or lending, and does not make browsing data available for human review by the developer.

Close a tab to clear its stored evidence, or close the browser to clear all session state. Uninstalling the extension also removes its extension storage.

Source code: https://github.com/newtro/php2shell-site-check
Contact: open an issue at https://github.com/newtro/php2shell-site-check/issues

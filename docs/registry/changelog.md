## 0.7.1

Copy the kit again after you update, from your site's root folder:

```bash
kit="$(mktemp -d)" &&
  git clone --depth 1 \
    --branch v0.7.1 \
    https://github.com/wbcomdesigns/emdash-listora \
    "$kit/emdash-listora" &&
  "$kit/emdash-listora/scripts/add-to-site.sh" .
```

- Fix: the first visitor after an update starts the data upgrade; no admin visit needed.
- Fix: import on a slow site goes on where it stopped and never adds a row twice.
- Fix: plain messages instead of server text; expiry turned on in the Plugins settings form runs daily.
- Fix: Messages says when the site cannot send email.
- Compat: needs EmDash 1.2.0 or later.

## 0.7.0

Fits Cloudflare's 10 requests per plugin call. Your 0.6.x data comes over by itself after the update.

- New: Listing changes and Listing photos admin pages; Next and Previous on every admin list.
- Improve: a stored directory index, exact ratings, the account one tab at a time, export of every listing, import a few rows at a time.
- Fix: the owner sees their own view of a listing; guests get Sign in in place of the forms; approvals publish on Node sites.
- Security: guest messages limited per visitor address, refused when the host gives none.
- Compat: tested on EmDash 1.3.1 and 1.5.0.

## 0.6.3

- Fix: cut-off approvals return to the queue.
- Improve: account tabs wrap on a phone.

## 0.6.2

- New: Get started gives the kit command for the installed version.
- Fix: lists no longer stop at 100 rows.

## 0.7.0

Fits Cloudflare's 10 requests per plugin call. Copy the kit again after you update, from your site's root folder:

```bash
kit="$(mktemp -d)" &&
  git clone --depth 1 \
    --branch v0.7.0 \
    https://github.com/wbcomdesigns/emdash-listora \
    "$kit/emdash-listora" &&
  "$kit/emdash-listora/scripts/add-to-site.sh" .
```

Your 0.6.x data comes over by itself, a step a minute, after the update. Meanwhile the directory routes of the plugin API ask callers to try again.

- New: Listing changes and Listing photos admin pages; Next and Previous on every admin list.
- Improve: a stored directory index, exact ratings, the account one tab at a time, export of every listing, import a few rows at a time.
- Fix: the owner sees their own view of a listing; a member's listing counts as theirs; guests get Sign in in place of the forms.
- Security: guest messages limited per visitor address, refused when the host gives none.

## 0.6.3

- Fix: cut-off approvals return to the queue; small fixes. Improve: account tabs wrap on a phone.

## 0.6.2

- New: Get started gives the kit command for the installed version. Fix: lists no longer stop at 100 rows.

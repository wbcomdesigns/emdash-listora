## 0.6.3

Copy the kit again after you update, from your site's root folder:

```bash
kit="$(mktemp -d)" &&
  git clone --depth 1 \
    --branch v0.6.3 \
    https://github.com/wbcomdesigns/emdash-listora \
    "$kit/emdash-listora" &&
  "$kit/emdash-listora/scripts/add-to-site.sh" .
```

- Fix: an approval cut off part way returns the listing or photo to the queue; More reviews has space above the review form; a damaged reviews link gets a plain message.
- Improve: account tabs wrap on a phone; the account names the full review count past 10; Settings names /listings/import/ on a fresh site.

## 0.6.2

Copy the kit again after you update.

- New: Get started gives the kit command for the installed version and the visitor addresses it adds.
- Fix: lists no longer stop at 100 rows on a large site; sample listings in the queue approve; a stale second decision is refused; an empty directory says so; dark mode buttons pass 4.5:1.
- Security: a new listing stores each field capped; the public health check writes nothing.
- Improve: admin group named Listora, reviews page named Listing reviews.

## 0.6.1

- Security: map popups show listing titles as plain text; emails are stored as plain addresses only. Copy the kit again after updating.
- Fix: renewing and editing follow the listing's current owner.

## 0.6.0

- Security: website links must be a full http or https address; server-side calls run inside EmDash with no web request.
- Improve: settings in tabs, Find and Load more on every admin list, all visitor wording in one file. Copy the kit again after updating.

Older versions: https://github.com/wbcomdesigns/emdash-listora/blob/main/CHANGELOG.md

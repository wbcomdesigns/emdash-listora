# Admin screens

**Included in Free**

Block Kit pages, not wp-admin and not React.

| Page | Path | Job |
| --- | --- | --- |
| Get started | `/_emdash/admin/plugins/listora/setup` | Setup status while something is missing. Once the directory has listings, this page is the queue |
| Listings queue | `/_emdash/admin/plugins/listora/queue` | Approve or reject submissions. 25 at a time, with Find and Load more |
| Reviews | `/_emdash/admin/plugins/listora/reviews` | Moderate reviews |
| Claims | `/_emdash/admin/plugins/listora/claims` | Moderate claims |
| Messages | `/_emdash/admin/plugins/listora/messages` | Messages from listing pages. Delete, in the Handle menu, opens the message and asks first |
| Settings | `/_emdash/admin/plugins/listora/settings` | One tab per group, one Save each |

Get started shows whether the listings collection exists, whether sample data is loaded, and a confirm button, until the directory has listings. Then the page is the queue. Health does not create listings. Load sample is safe to click more than once. After it succeeds, copy the site kit so `/listings/` exists.

Settings are their own page, in tabs: Submissions, Listing lifetime, Photos, Messages, and Import and export. Each tab that saves has one Save.

Import and export live on the site kit page `/listings/import/`, for site admins only. Export downloads your published listings (up to 500) as a CSV spreadsheet with the main details of each. Import checks a CSV first (bad rows with the reason, duplicates by title and city), then adds the good rows as drafts in the Listings queue, up to 100 at a time. Nothing is published by an import. Settings links to the page. It is a site page, not an admin screen, because EmDash admin screens cannot take a file or start a download.

## Not built

- Listing type editor (`/types`)
- Search, maps, and review rules as their own settings tabs
- Analytics
- Email template editor
- Audit log
- A setup wizard. Get started is a checklist plus **Load sample directory**. It does not create the collection or copy the directory pages.

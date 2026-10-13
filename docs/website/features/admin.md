# Admin queue

**Included in Free**

Block Kit pages, not wp-admin and not React.

| Page | Path | Job |
| --- | --- | --- |
| Get started | `/_emdash/admin/plugins/listora/setup` | Collection check, Load sample directory, site-kit reminder |
| Listings | `/_emdash/admin/plugins/listora/queue` | Approve or reject submissions |
| Reviews | `/_emdash/admin/plugins/listora/reviews` | Moderate reviews |
| Claims | `/_emdash/admin/plugins/listora/claims` | Moderate claims |

Get started shows whether the listings collection exists, whether sample data is loaded, and a confirm button. Health does not create listings. Load sample is safe to click more than once. After it succeeds, copy the site kit so `/listings/` exists.

Settings live on the queue page for now: require moderation, default type, spam keywords.

Import and export live on the site kit page `/listings/import/`, for site admins only. Export downloads every published listing as a CSV spreadsheet. Import checks a CSV first (bad rows with the reason, duplicates by title and city), then adds the good rows as drafts in the Listings queue, up to 500 at a time. Nothing is published by an import. Settings links to the page. It is a site page, not an admin screen, because EmDash admin screens cannot take a file or start a download.

## Not built

- Listing type editor (`/types`)
- Own settings IA (submit, search, maps, reviews, spam as sections)
- Analytics
- Email template editor
- Audit log
- PHP-style setup wizard. Get started is a Block Kit checklist plus Load sample. It does not create the collection or copy Astro pages.

Match Listora admin **jobs**. Do not pixel-clone wp-admin.

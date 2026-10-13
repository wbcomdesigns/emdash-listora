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

Import is a plugin route (`import`) with a sample CSV in `site-kit/seed/import/sample.csv`. There is no Block Kit import screen yet.

## Not built

- Listing type editor (`/types`)
- Own settings IA (submit, search, maps, reviews, spam as sections)
- Analytics
- Email template editor
- Audit log
- PHP-style setup wizard. Get started is a Block Kit checklist plus Load sample. It does not create the collection or copy Astro pages.

Match Listora admin **jobs**. Do not pixel-clone wp-admin.

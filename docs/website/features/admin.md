# Admin queue

**Included in Free**

Block Kit pages, not wp-admin and not React.

| Page | Path | Job |
| --- | --- | --- |
| Listings | `/_emdash/admin/plugins/listora/queue` | Approve or reject submissions |
| Reviews | `/_emdash/admin/plugins/listora/reviews` | Moderate reviews |
| Claims | `/_emdash/admin/plugins/listora/claims` | Moderate claims |

Settings live on the queue page for now: require moderation, default type, spam keywords.

Import is a plugin route (`import`) with a sample CSV in `site-kit/seed/import/sample.csv`. There is no Block Kit import screen yet.

## Not built

- Listing type editor (`/types`)
- Own settings IA (submit, search, maps, reviews, spam as sections)
- Analytics
- Email template editor
- Audit log
- Setup wizard (site-kit apply replaces the PHP wizard)

Match Listora admin **jobs**. Do not pixel-clone wp-admin.

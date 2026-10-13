# Plugin routes

**Included in Free**

Base: `/_emdash/api/plugins/listora/<name>`. Public routes are internet-facing. Validate input.

| Route | Who | Job |
| --- | --- | --- |
| `health` | public | Version, collection present, pending count. Demo storage seeds only if Golden Fork already exists |
| `types` | public | 10 listing types |
| `listings` | public | Published listings, filters. Takes `page` and `per_page` (24 default, 60 max), returns `total`, `page`, `pages` |
| `search` | public | Query, type, geo, suggest. Paged like `listings` |
| `ratings` | public | `ids` (comma list, 80 max). Rating and review count per listing, from plugin storage |
| `duplicate` | public | Title clash |
| `reviews` | public | Published reviews for one listing. Read only |
| `contact` | public | Store a message for a listing. Honeypot and an hourly limit per IP |
| `submit` | member | Create a listing. Published at once when moderation is off, pending otherwise |
| `review` | member | Write or replace your review. Always pending until approved |
| `claims` | member | Claim a listing |
| `favorites` | member | List, save, remove |
| `dashboard` | member | Your listings, reviews, claims and favorites |
| `privacy` | member | Export or erase your own rows |
| `renew` | member | Owner or admin only |
| `import` | admin | CSV / JSON / GeoJSON in and out |
| `admin` | admin | Block Kit pages |

"Member" is a private route with `permission: "content:read"`, the lowest signed-in role. The host verifies the session and passes `routeCtx.user`. Never read a member id from the request. "Admin" is a private route with no permission set, which the host treats as `plugins:manage`. A public route gets no user at all.

A member route must not write to or publish a listing. Ratings live in plugin storage (`ratings`), so they update without touching the listing. The claimed flag changes only when an admin approves a claim.

Public reads (`types`, `listings`, `search`, `duplicate`, `ratings`, `reviews`) are cached at the edge for 30 seconds. Allow that long before a change shows.

Hook: `content:afterSave` indexes a listing save into `storage.events`.

Tests live in `tests/plugin.test.ts`: guests refused on member routes, a request member id ignored, pending reviews hidden, erase limited to the caller, the hourly limit, renew ownership, stale approvals refused, and the moderation pages rendering with rows. Add a test when you add a route.

`listPublished` wraps `content.list` in try/catch. An empty test D1 has no `ec_listings` table.

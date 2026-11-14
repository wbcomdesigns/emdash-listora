# Plugin routes

**Included in Free**

Base: `/_emdash/api/plugins/listora/<name>` on a local install, `/_emdash/api/plugins/r_2oeji6rfeg7ovdex/<name>` on a registry install. Public routes are internet-facing. Validate input.

Every route makes 9 calls to the site or fewer (Cloudflare allows 10 per plugin call), measured in `tests/bridge-budget.test.ts`. The directory routes read the directory index Listora keeps in plugin storage, one page at a time, and answer `INDEX_BUILDING` while the 0.7.0 upgrade builds it. A failed read is answered with an error (`READ_FAILED`), never with an empty list.

| Route | Who | Job |
| --- | --- | --- |
| `health` | public | Plugin id, version and whether the listings collection exists. Read only: it writes nothing |
| `types` | public | 10 listing types |
| `listings` | public | Published listings, filters (`type`, `category` (a listing_category slug, a listing's first category), `city_exact` (a whole city name, any case), `q`, `city` (part of a city, state or country), `amenity`, `lat`, `lng`, `radius`, `sort`). `ids` (comma list, 100 max, for example from EmDash's `search()`): those listings that pass the filters, in the order sent, with no cursor. Cards leave out the long `description`. Takes `per_page` (24 default, 60 max) and `cursor`; returns `items` and `cursor` for the next page (null at the end), and `total` when it is exact (no text, place, feature or distance filter). Those filters read up to 600 listings per request and hand back a cursor to go on from, so a page can hold fewer than `per_page`. `page` above 1 is refused: page with the cursor. `sort` is `featured` (default), `rating`, `title`, or a sort slot `n1` to `n3` with `order` `desc` (default) or `asc`; a slot sort needs a `type` whose fields fill that slot (else `VALIDATION_ERROR`), and listings with no value come after the rest in either direction |
| `search` | public | Same as `listings`; `action=suggest` (titles starting with `q`, 8 at most) and `action=map` (800 points per request, with a cursor) |
| `ratings` | public | `ids` (comma list, 80 max): rating and review count per listing. `all=1`: rated listings best first, 700 per request, with a cursor |
| `duplicate` | public | Title clash |
| `reviews` | public | Published reviews for one listing. Read only |
| `contact` | public | Store a message for a listing. Honeypot and an hourly limit per IP |
| `submit` | member | Create a listing. Published at once when moderation is off, pending otherwise |
| `review` | member | Write or replace your review. Always pending until approved |
| `claims` | member | Claim a listing |
| `favorites` | member | GET: your saved listings, 100 per request with a cursor; `ids` (100 max): which of those are saved; `listingId`: whether it is saved and who manages it (`owner`: you, other or empty). POST saves, DELETE removes |
| `dashboard` | member | One tab per request: `tab` is overview (counts), listings, reviews (20 reviews of your listings per request, `received_cursor`), messages (50 per request, `messages_cursor`), claims or favorites. With no tab (the 0.6.x kit) every list comes back without photos and change marks |
| `privacy` | member | GET: your own rows. POST with `action=erase` deletes them a part per request and answers `MORE` until `erased: true` (a GET never erases) |
| `renew` | member | Owner or admin only |
| `export` | admin | CSV of published listings, 700 per request: `part=1` and the `X-Listora-Cursor` header for the next part |
| `import` | admin | `mode=check` reads up to 100 rows; `mode=import` takes 2 rows per request (the kit sends a file in batches, with `firstLine`). Sending a batch again is safe: rows already waiting are duplicates, and a draft a cut-off request created gets its queue row instead of a second copy. When time runs short the answer carries `next`, the file line to send again from |
| `sample` | admin | The kit page `/listings/sample/` posts `step` with the rows of `lib/listora-sample.json`. `state` says where loading is; `start` finds sample listings already on the site by title (or goes on from a load left part way); `listings` creates and publishes a few per request; `related` adds the reviews, the claim, the saved listings and the ratings worked out from the published sample reviews. Each answer carries the next `step`. Every step claims its state before it writes, so two tabs never add a listing twice. Each row is checked again: a type the site has, its own fields, no place for a type without a location |
| `admin` | admin | Block Kit pages |

"Member" is a private route with `permission: "content:read"`, the lowest signed-in role. The host verifies the session and passes `routeCtx.user`. Never read a member id from the request. "Admin" is a private route with no permission set, which the host treats as `plugins:manage`. A public route gets no user at all.

A member route must not write to or publish a listing. Ratings live in plugin storage (`ratings`), moved by in-database increments in the same call as the review decision, so they update without touching the listing. The claimed flag changes only when an admin approves a claim, or, with `SUBMITTER_IS_OWNER` (on by default), when a member adds a listing: it then counts as theirs and nobody else can claim it.

Guest writes (`contact`) are limited per visitor address, keyed by the shared `guestKey` (IPv6 by its /64). A host that passes on no usable address gives no way to limit guests, so the message is refused with `GUEST_UNAVAILABLE`: set `trustedProxyHeaders` to a header your proxy overwrites (`x-real-ip` behind nginx).

Public reads (`types`, `listings`, `search`, `duplicate`, `ratings`, `reviews`) are cached at the edge for 30 seconds. Allow that long before a change shows.

Hooks: `content:afterPublish`, `afterUnpublish`, `afterRestore`, `afterDelete` and `afterSave` keep the directory index (`storage.directory`) in step with the listings; an hourly `sweep` puts right any listing whose hook did not run. Scheduled tasks: `notify` (hourly owner notices), `expire` (daily expiry and warnings), `tidy` (hourly upkeep), `sweep`, and while there is work the one-shot `notify-more`, `expire-more`, and `upgrade`. A 0.7.x site's per-minute `sample` task cancels itself on its next run.

Tests live in `tests/plugin.test.ts`: guests refused on member routes, a request member id ignored, pending reviews hidden, erase limited to the caller, the hourly limit, renew ownership, stale approvals refused, and the moderation pages rendering with rows. Add a test when you add a route.

Never ask for listing rows on a site without the listings type: the failure happens inside the bridge, where it goes unanswered until the request is cancelled as hung. Listora checks the field list it keeps in settings first.

# Handoff: Listora (2026-11-16)

Live: **0.8.0** on the EmDash registry as `@vapvarun.bsky.social/listora`. Public page: https://plugins.emdashcms.com/plugins/@vapvarun.bsky.social/listora

Test on a fresh `create-emdash` blog site (registry install, kit from the release tag) and on the Cloudflare test site. On Cloudflare, redeploy after a registry install or update before judging anything (emdash-cms/emdash#4865).

## In review: 0.8.1

Branch `0.8.1`, pull request "Listora 0.8.1": the fixes from the 2026-11-16 QA pass (#112 to #121), #106 and #110. Not published. Open owner questions on the milestone: #87 (should the Listings queue stats show more than Waiting?) and #106's unexplained approval (watch, reproduce before changing code).

Then the release gate (`gate.sh`), an independent walk on Node and Cloudflare, and publish only with the owner's go-ahead.

Bundle: `backend.js` is about 130.9 KB of the 131,072-byte cap per file. Any new engine code needs something taken out first: owner text in the admin and dead compat paths are what is left to trim.

## How a release is verified

Every case in `docs/qa/QA_CHECKLIST.md` is run in a browser as guest, subscriber and admin, and every route is traced from the kit page that calls it to its storage and its admin screen. The 0.4.1 pass did this in full and found seven problems that route-level checks had missed (contrast in dark mode, keyboard tabs, blank areas on a failed request, a function with no button). Do the full pass before publishing, not after.

## Do not do

- Pro plan, jobs, credits, Compare, Needs
- Hub deploy, or using WordPress hub slug `listora`
- Committing QA screenshots (registry screenshots in `images/` are the exception)
- AI co-author trailers or em-dashes
- Publishing from a dirty or unmerged branch
- Putting exploit detail in a public issue. This repo is public

## Known thin spots

| Item | Note |
| --- | --- |
| Live-site preview | Kit is proven on a clean second site (`portfolio` template). Not yet proven on a preview deploy of a live fleet site (Cloudflare, EmDash 1.1) |
| Directory size | Plugin routes read the stored directory index a page at a time (proven at 2000 listings within 9 calls). The kit's own directory page still reads the newest 500 listings itself (site code, no request limit). Long descriptions make each index page heavy: watch Cloudflare's 50 ms CPU limit on text searches |
| Contact | Stored, shown in admin Messages and in the owner's account. Nothing is mailed from the visitor's request. The hourly `notify` task (`notifyOwners`) sends each owner one notice to their account address, with no visitor text. Owner = the member on the listing's approved submission row (`listingOwner`); approving a claim moves that row. The address lives only in kv `member-email:<id>`, refreshed on member routes, deleted on erase |
| Permissions | The next release adds `email:send`, `taxonomies:read`, `taxonomies:write`. That widens what the plugin may do, so decide the version number with the owner |
| Categories | Filtering by category is done by the kit page, not the search route, so a search inside a category reloads the page |
| Expiry | Off by default (0 days). Listora keeps the date on the directory index row (`exp`), set at approval (via the submission row and the content hook) and by Renew. The daily task expires two listings per run and carries on a minute later while work is left |
| Photos | `photo` route (member, byte body, 5 MB) uploads to the media library and stores a `photos` row with a random id. The member is never given the file address or media id of a waiting photo. The admin approves from the Listings queue, which appends to the listing's `gallery` repeater field (and sets the cover if empty). Approval and removal both claim the row with a guarded update first. One upload at a time per listing (kv lock). Needs the `gallery` field: a plugin cannot add fields, so Settings shows how when it is missing |
| Owner replies | `reply` route writes `reply_draft` on the review with a guarded update; the admin approves from the Reviews page; `owner_reply` is what the public sees. A reviewer rewriting their review clears the reply |
| Showing member text to the admin | Use a `code` block (exact text, never shortened, never read as formatting). `src/lib/edits.ts` is the one place that decides what an edit changes: the screen and the approval both call `editPatch` |
| Owner edits | `edit` route stores only the fields that differ in `edits` (one per listing). The admin applies them from the Listings queue with `patchListing`. `EDITABLE` in `plugin.ts` is the list an owner may change. The category is not editable by the owner |
| Banner | `images/banner.png` is the dark-text lockup on a transparent ground. Check it on the registry page |
| No-photo listings | `placeholderHtml(type)` in the kit lib: a panel with a type icon. No stock photos. The owner-chosen default image is dropped: EmDash's media picker cannot be used in a plugin admin form, and choosing by file name from a long list is not good enough to ship |
| Listing email | Kept on the listing (owner edit form, admin, CSV). Never in a public route (`cardOf` drops it, also from rows indexed before 0.8.1) nor on the listing page. EmDash core still lets any signed-in member read a published entry through its content API |
| Live search | Loads the directory page for the new query and swaps in its results (`LIVE` ids in `index.astro`). One card renderer: the server's. The plugin `search`, `listings` and `types` routes are not used by the kit; they stay as the public API |
| Near me | Removed. EmDash core sends `Permissions-Policy: geolocation=()` on every page |
| Time zone | The site's own, from EmDash settings (`siteZone` in the kit lib). The plugin never computes open or closed: the page does, because a plugin cannot read the site zone. Listings no longer store a zone |

QA cases by role: `docs/qa/QA_CHECKLIST.md` (walk all of it before a release; `./scripts/lab-role.sh subscriber` for member cases). QA source: `docs/qa/`. Screen ticks: `docs/qa/screen-checklist.md`. Parked Pro: `docs/website/pro-features/parked-work.md`.

When this page goes stale, rewrite the date and the next list in the same commit as the work.

## Next

- 0.6.0 is live (2026-10-15): settings in tabs, Find and Load more on admin lists, all visitor wording in `site-kit/lib/listora-strings.ts`, and the website-link and in-process route security fixes (0.5.3 was folded in and never published alone).
- Issue #28 (type editor, reminders, health check) is closed as not planned. Owner: getting listed first.
- No open issues. Findings after a release: patch only if a site owner is exposed, otherwise a card for the next milestone.
- Never proven on a hosted site: a 100-row import and the scheduled tasks on Cloudflare, owner photos on R2, real mail delivery.


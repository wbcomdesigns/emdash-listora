# Handoff (2026-10-14, after 0.5.0)

Read this first in a new session. Then `AGENTS.md`, `CONTRIBUTING.md`, and `docs/website/getting-started/new-machine.md`.

This product is Free only. No Pro. Work is tracked as GitHub issues under the `0.3.0`, `0.4.0` and `Later` milestones. There is no Basecamp board. Do not add Compare, Needs, credits, Google Maps, lead forms, verification, photo reviews, or native-plugin features.

## Where the code lives

| Thing | Where |
| --- | --- |
| Plugin (source of truth) | this repo, `main` |
| Registry | `@vapvarun.bsky.social/listora`. Latest published is `0.5.0` (2026-10-14) |
| Lab host | sibling EmDash site `emdash-local` (not this git repo) |
| WordPress Listora | scope and visual reference only. Do not copy PHP |

GitHub tag, `package.json`, and the registry version must stay the same number. Do not `--allow-overwrite`. Do not republish an old version.

## What 0.3.0 changed

- Member routes are private with `permission: "content:read"` and use `routeCtx.user`. A public route never gets a user. Never read a member id from the request
- A member route must not write to or publish a listing. Rating and claimed flag change only on an admin decision
- `import` is admin only. `reviews` is read only. New member route `review`
- Moderation clicks carry the version the admin saw (`rev`). A rewritten or already-handled row is refused
- Block Kit tables need `page_action_id`. Without it the whole admin page fails to render
- Updating a published listing only saves a draft. `patchListing` in `src/lib/listings-query.ts` updates and republishes, and refuses (`busy`) when the listing already has unpublished edits so it never publishes someone's draft
- Anything a member can write that an admin page later reads must not be able to break that page. `drainRatingDirty` is the pattern: small batch, each item isolated
- Kit colours use `light-dark()` and follow the site theme. There is no `.dark` class block
- Ratings are rows in plugin storage (`ratings`), written by `syncRating`. Nothing writes to a listing for a rating. Cards get them from the `ratings` route, listing pages from the `reviews` answer, structured data from the `page:metadata` hook
- Public read routes carry `cacheControl` (30 seconds). Tests run inside workerd with no file system: read repo files in a test with a `?raw` import
- Kit pages share `api`, `esc`, `notify` from `site-kit/lib/listora.ts`. Anything from the API goes through `esc` before `innerHTML`
- Registry media: `icon.png`, `images/`, `docs/registry/*.md`, wired in `emdash-plugin.jsonc`

## Start on any machine

```bash
git clone https://github.com/wbcomdesigns/emdash-listora.git
cd emdash-listora
npm install --legacy-peer-deps
./scripts/setup-lab.sh
./scripts/reset-lab.sh
./scripts/prove-lab.sh --all
```

Override lab folder with `LISTORA_LAB`. After a kit change: edit `site-kit/`, then `./scripts/apply-kit.sh`. Second site for proving the kit off the starter: `npm create emdash@latest -- emdash-lab-listora2 --template portfolio --platform node --pm npm --yes` beside this repo, then run the lab scripts with `LISTORA_LAB=../emdash-lab-listora2 LISTORA_PORT=4322` (and `LISTORA_BASE=http://localhost:4322` for `prove-lab.sh`). After a plugin change: `npm run build`, then restart the lab dev server (reset-lab also wipes the lab database). Sign in on the lab with `/_emdash/api/setup/dev-bypass?redirect=/account/`.

`emdash-plugin publish` needs `vapvarun.bsky.social`. Open a PR. The publisher ships after merge.

## Next, in order

0.5.0 is released: merged to `main`, tagged `v0.5.0`, published to the registry and on GitHub releases. `PLAN.md` holds every owner decision behind it and its corrections. `docs/qa/QA_CHECKLIST.md` says how it was walked and lists the known gaps honestly.

1. `0.6.0` is the open release branch. Issue #59 moved visitor phrases into `site-kit/lib/listora-strings.ts`. Issue #55 puts Settings in tabs and keeps Load more on the lists. Issue #60 (owner guides) is still to do. Do not merge, tag, or publish until it is in.
2. Issue #28 (type editor, reminders, health check) stays under Later until the owner picks it.
3. Worth proving when a site allows it, none of it blocking: a 100-row import and the scheduled tasks on a Cloudflare-hosted site, owner photos on R2, real mail delivery, and the kit on a live site once one runs EmDash 1.2 (never on a preview that shares the live database).

How 0.5.0 was checked, for the next release to copy: an independent agent walked the whole checklist in a browser and looked at every screenshot (it found 22 points, including that listing pages never showed the extra fields of their type), then an independent review read the new code (no security hole, six practical fixes). The builder fixed and re-checked each. The automatic security review that used to follow each push did not arrive for the last pushes, so do not wait on it: ask for an independent review.

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
| Directory size | Reads at most 500 listings and filters in memory |
| Contact | Stored, shown in admin Messages and in the owner's account. Nothing is mailed from the visitor's request. The hourly `notify` task (`notifyOwners`) sends each owner one notice to their account address, with no visitor text. Owner = the member on the listing's approved submission row (`listingOwner`); approving a claim moves that row. The address lives only in kv `member-email:<id>`, refreshed on member routes, deleted on erase |
| Permissions | The next release adds `email:send`, `taxonomies:read`, `taxonomies:write`. That widens what the plugin may do, so decide the version number with the owner |
| Categories | Filtering by category is done by the kit page, not the search route, so a search inside a category reloads the page |
| Expiry | Off by default (0 days). The daily task is scheduled when the owner saves a number above 0. 50 listings per run |
| Photos | `photo` route (member, byte body, 5 MB) uploads to the media library and stores a `photos` row with a random id. The member is never given the file address or media id of a waiting photo. The admin approves from the Listings queue, which appends to the listing's `gallery` repeater field (and sets the cover if empty). Approval and removal both claim the row with a guarded update first. One upload at a time per listing (kv lock). Needs the `gallery` field: a plugin cannot add fields, so Settings shows how when it is missing |
| Owner replies | `reply` route writes `reply_draft` on the review with a guarded update; the admin approves from the Reviews page; `owner_reply` is what the public sees. A reviewer rewriting their review clears the reply |
| Showing member text to the admin | Use a `code` block (exact text, never shortened, never read as formatting). `src/lib/edits.ts` is the one place that decides what an edit changes: the screen and the approval both call `editPatch` |
| Owner edits | `edit` route stores only the fields that differ in `edits` (one per listing). The admin applies them from the Listings queue with `patchListing`. `EDITABLE` in `plugin.ts` is the list an owner may change. The category is not editable by the owner |
| Banner | `images/banner.png` is the dark-text lockup on a transparent ground. Check it on the registry page |
| No-photo listings | `placeholderHtml(type)` in the kit lib: a panel with a type icon. No stock photos. The owner-chosen default image is dropped: EmDash's media picker cannot be used in a plugin admin form, and choosing by file name from a long list is not good enough to ship |
| Live search | Loads the directory page for the new query and swaps in its results (`LIVE` ids in `index.astro`). One card renderer: the server's. The plugin `search`, `listings` and `types` routes are not used by the kit; they stay as the public API |
| Near me | Removed. EmDash core sends `Permissions-Policy: geolocation=()` on every page |
| Time zone | The site's own, from EmDash settings (`siteZone` in the kit lib). The plugin never computes open or closed: the page does, because a plugin cannot read the site zone. Listings no longer store a zone |

QA cases by role: `docs/qa/QA_CHECKLIST.md` (walk all of it before a release; `./scripts/lab-role.sh subscriber` for member cases). QA source: `docs/qa/`. Screen ticks: `docs/qa/screen-checklist.md`. Parked Pro: `docs/website/pro-features/parked-work.md`.

When this page goes stale, rewrite the date and the next list in the same commit as the work.

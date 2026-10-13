# Handoff (2026-10-13, after 0.4.1)

Read this first in a new session. Then `AGENTS.md`, `CONTRIBUTING.md`, and `docs/website/getting-started/new-machine.md`.

This product is Free only. No Pro. Work is tracked as GitHub issues under the `0.3.0`, `0.4.0` and `Later` milestones. Do not add Compare, Needs, credits, Google Maps, lead forms, verification, photo reviews, or native-plugin features.

## Where the code lives

| Thing | Where |
| --- | --- |
| Plugin (source of truth) | this repo, `main` |
| Registry | `@vapvarun.bsky.social/listora`. Latest published is `0.4.1` |
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

1. Confirm the registry page shows the icon, banner and screenshots once the listing checks pass.
2. Milestone `0.4.0` shipped paging, the Messages page, stored ratings and the kit changes for existing sites. Still open there: #23 (prove the kit on a clean second site and a preview of a live one), #20 (email the listing owner).
3. Milestone `0.5.0`: categories and locations as filters, gallery, listing expiry, admin pages for import and settings.
4. Milestone `Later`: type editor, reminders, health check.

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
| Contact | Stored, shown in admin Messages and in the owner's account. Owner notice by email goes only to the account address, with no visitor text, once per listing per hour (`notifyOwner`). Listings with no owner account (imported, admin-made, unclaimed) notify nobody. Needs the new `email:send` permission, so the next release widens what the plugin may do |
| Expiry | Off by default (0 days). The daily task is scheduled when the owner saves a number above 0. 50 listings per run |
| Dashboard rows | Renew only. No edit |
| Featured row | The same listings repeat at the top of the grid below it |
| Banner | `images/banner.png` is the dark-text lockup on a transparent ground. Check it on the registry page |
| Timezone | Hardcoded to America/New_York on submit and in the calendar |

QA cases by role: `docs/qa/QA_CHECKLIST.md` (walk all of it before a release; `./scripts/lab-role.sh subscriber` for member cases). QA source: `docs/qa/`. Screen ticks: `docs/qa/screen-checklist.md`. Parked Pro: `docs/website/pro-features/parked-work.md`.

When this page goes stale, rewrite the date and the next list in the same commit as the work.

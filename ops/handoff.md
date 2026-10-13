# Handoff (2026-10-13, after 0.3.0 work)

Read this first in a new session. Then `AGENTS.md`, `CONTRIBUTING.md`, and `docs/website/getting-started/new-machine.md`.

This product is Free only. No Pro. Work is tracked as GitHub issues under the `0.3.0`, `0.4.0` and `Later` milestones. Do not add Compare, Needs, credits, Google Maps, lead forms, verification, photo reviews, or native-plugin features.

## Where the code lives

| Thing | Where |
| --- | --- |
| Plugin (source of truth) | this repo, `main` |
| Registry | `@vapvarun.bsky.social/listora`. Live version is `0.2.1` until `0.3.0` is published |
| Working branch | `fix/0-3-0-core-flows` until its PR merges |
| Lab host | sibling EmDash site `emdash-local` (not this git repo) |
| WordPress Listora | scope and visual reference only. Do not copy PHP |

GitHub tag, `package.json`, and the registry version must stay the same number. Do not `--allow-overwrite`. Do not republish an old version.

## What 0.3.0 changed

- Member routes are private with `permission: "content:read"` and use `routeCtx.user`. A public route never gets a user. Never read a member id from the request
- A member route must not write to or publish a listing. Rating and claimed flag change only on an admin decision
- `import` is admin only. `reviews` is read only. New member route `review`
- Moderation clicks carry the version the admin saw (`rev`). A rewritten or already-handled row is refused
- Block Kit tables need `page_action_id`. Without it the whole admin page fails to render
- Updating a published listing only saves a draft. `patchListing` in `src/lib/listings-query.ts` updates and republishes
- Kit colours use `light-dark()` and follow the site theme. There is no `.dark` class block
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

Override lab folder with `LISTORA_LAB`. After a kit change: edit `site-kit/`, then `./scripts/apply-kit.sh`. After a plugin change: `npm run build`, then restart the lab dev server (reset-lab also wipes the lab database). Sign in on the lab with `/_emdash/api/setup/dev-bypass?redirect=/account/`.

`emdash-plugin publish` needs `vapvarun.bsky.social`. Open a PR. The publisher ships after merge.

## Next, in order

1. Merge the 0.3.0 PR, tag `v0.3.0`, publish, then check the registry page shows the icon and screenshots.
2. Milestone `0.4.0`: contacts admin screen and mail, paging, kit free of starter-only imports plus the second-site prove, categories and locations as filters, gallery, listing expiry, admin pages for import and settings.
3. Milestone `Later`: type editor, reminders, health check.

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
| Second-site apply | Kit pages still import the starter's `layouts/Base.astro` and `utils/site-identity`. Not proven on a clean site |
| Paging | Archive shows 80 listings, search 100. `cursor` is null |
| Contact | Stored, never delivered, no admin screen |
| Dashboard rows | Read only. No edit or renew action |
| Featured row | The same listings repeat at the top of the grid below it |
| Banner | `images/banner.png` is the dark-text lockup on a transparent ground. Check it on the registry page |
| Timezone | Hardcoded to America/New_York on submit and in the calendar |

QA cases by role: `docs/qa/QA_CHECKLIST.md` (walk all of it before a release; `./scripts/lab-role.sh subscriber` for member cases). QA source: `docs/qa/`. Screen ticks: `docs/qa/screen-checklist.md`. Parked Pro: `docs/website/pro-features/parked-work.md`.

When this page goes stale, rewrite the date and the next list in the same commit as the work.

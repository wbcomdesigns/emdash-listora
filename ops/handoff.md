# Handoff (2026-10-13)

Read this first in a new session. Then `AGENTS.md`, `CONTRIBUTING.md`, and `docs/website/getting-started/new-machine.md`.

This product is Free only. No Pro. Next work is Free chrome and a second-site prove. Do not add Compare, Needs, credits, Google Maps, lead forms, verification, photo reviews, or native-plugin features.

## Where the code lives

| Thing | Where |
| --- | --- |
| Plugin (source of truth) | this repo, `main` |
| Registry | `@vapvarun.bsky.social/listora@0.2.1` (listing still waiting checks) |
| GitHub tag | `v0.2.1` |
| Lab host | sibling EmDash site `emdash-local` (not this git repo) |
| WordPress Listora | visual reference only. Do not copy PHP |

GitHub tag, `package.json`, and the registry version must stay the same number. Do not `--allow-overwrite`. Do not republish `0.1.0` or `0.2.0`.

## What already shipped

- Engine: search, submit, reviews, claims, favorites, contact, import, privacy, renew, Block Kit admin
- Get started + Load sample directory (12 NYC listings)
- Site kit pages: archive, detail, submit, calendar, account
- 0.2.1 chrome: sideways type chips, featured track, full-width cover, sidebar cards, America/New_York calendar times
- New-machine path: `./scripts/setup-lab.sh` creates a sibling EmDash site, wires `file:` plugin, copies kit, merges seed

## Start on any machine

```bash
git clone https://github.com/wbcomdesigns/emdash-listora.git
cd emdash-listora
npm install --legacy-peer-deps
./scripts/setup-lab.sh
./scripts/reset-lab.sh
./scripts/prove-lab.sh --all
```

Override lab folder with `LISTORA_LAB`. After a chrome change: edit `site-kit/`, then `./scripts/apply-kit.sh`. Forms: `docs/website/how-to/form-presentation.md`.

`emdash-plugin publish` needs `vapvarun.bsky.social`. Open a PR. The publisher ships after merge.

## Suggested next PR (in order)

1. Prove `setup-lab.sh` on a clean second EmDash site, not the original lab. That is the owner-apply gate.
2. Archive chrome still thin: category icon grid, paging, empty / loading / error. Featured is already a horizontal track.
3. Extract Card + Grid + Search into `site-kit/components/` so pages stay drop-in.
4. Calendar month plus phone agenda. Dashboard left nav with real account URLs.
5. Registry listing icon and screenshots (labeler still sees an unfinished catalog tile).
6. Dark-mode walk at 390 / 768 / 1440 after the chrome PR.

Next registry bump for kit/UX is patch `0.2.2`. Same number on `package.json`, `CHANGELOG.md`, tag `v0.2.2`, and `emdash-plugin publish`. Testers stay on `0.2.1` until that lands.

## Do not do

- Pro plan, jobs, credits, Compare, Needs
- Hub deploy, or using WordPress hub slug `listora`
- Treating lab pages as finished product UI
- Committing QA screenshots
- AI co-author trailers or em-dashes
- Publishing from a dirty or unmerged branch

## Known thin spots

| Item | Note |
| --- | --- |
| Second-site apply | `setup-lab.sh` exists. Not proven on a fresh machine yet |
| Typecheck | Pre-existing `catalog.ts` / review-filter errors. Tests still pass (9) |
| Host auth | Account uses `demo-member` |
| Import / settings / type editor | Routes or schema only. No real admin IA |
| Paging | `cursor` is null |
| Dark mode | Not re-walked after 0.2.1 |

QA source: `docs/qa/`. Screen ticks: `docs/qa/screen-checklist.md`. Parked Pro: `docs/website/pro-features/parked-work.md`.

When this page goes stale, rewrite the date and the next-PR list in the same commit as the work.

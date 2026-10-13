# Cover before the next version

**Included in Free**

`0.1.0` and `0.2.0` stay published. Testers must not treat them as the product. Tell testers to install `@vapvarun.bsky.social/listora@0.2.1` only.

Do not overwrite `0.1.0`. Do not start Pro.

## What testers hit today (half-cooked)

| # | Gap | Why it fails a test | Status |
| --- | --- | --- | --- |
| 1 | No drop-in pages in the kit | Install does not create `/listings/`. Owner sees admin queues and an empty site | Covering now. Pages are in `site-kit/pages/` |
| 2 | Collection apply is lab-only | A second site has no `listings` fields unless someone runs the seed | Still open |
| 3 | No menu recipe | Listings, Submit, Calendar, Account are missing from a clean site nav | Still open |
| 4 | Listing has no icon or screenshots | Labeler and catalog page look unfinished | Still open |
| 5 | Bundle README overclaims | Root README talks about lab pages as if they ship with install | Still open |
| 6 | Registry `0.1.0` still in queue | Anyone who finds that release is testing the old bundle | Point testers at `0.2.1` |
| 7 | Host member auth | Account uses `demo-member` | Thin. Accept for `0.2.0` |
| 8 | Chrome vs WordPress Free | No gallery, category grid, paging, map-drag. Featured is a horizontal track now | Thin. Do not block `0.2.1` |
| 9 | No first-run sample load | Testers open an empty directory and think the plugin is broken | Covering now. Admin → Get started → Load sample directory |

Skip: Compare, Needs, credits, Google Maps, lead forms, verification.

## Cover list for `0.2.0` (tester-safe)

These must be true before publish:

1. [x] Public pages live in `site-kit/pages/` (archive, detail, submit, calendar, account).
2. [x] `site-kit/README.md` is an owner apply: install plugin, copy CSS, copy pages, copy lib, Load sample or run seed, add four menu links.
3. [x] Root `README.md` says: plugin is the engine. Copy the kit. No `/listings/` from install alone.
4. [x] `docs/website/getting-started/install.md` matches that apply.
5. [ ] `npm test` and `./scripts/prove-lab.sh --all` pass on the lab after a kit copy.
6. [ ] Walk [screen-checklist.md](screen-checklist.md) at 1440 and 390: search, open, submit, approve, card on archive.
7. [x] Listing copy does not claim "pages appear on install".
8. [x] Bump `package.json` to `0.2.0`, changelog, then `emdash-plugin publish`.
9. [ ] Testers use `emdash-plugin info vapvarun.bsky.social listora --version 0.2.1 --watch`.

## How testers use only the new version

```bash
npx emdash-plugin info vapvarun.bsky.social listora --version 0.2.1
```

Install `@vapvarun.bsky.social/listora@0.2.1`. Ignore `0.1.0` and `0.2.0`. After copy of `site-kit/`, `/listings/` must load.

## Do not wait for these

Type editor, settings IA, import admin, gallery, category icon grid, map cluster, host mail. Those stay Free chrome work after `0.2.1`.

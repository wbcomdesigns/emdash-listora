# What we built in 0.1.0

**Included in Free**

Shipped 2026-10-13. Registry release `@vapvarun.bsky.social/listora@0.1.0`. Publisher DID `did:plc:2o6axbe264shvyedyhycyhya`. GitHub source attached to the package profile.

This page is the team brief. Planning notes that fed it sit in [`ops/`](https://github.com/wbcomdesigns/emdash-listora/tree/main/ops) so nothing lives only on one machine.

## Proven

The local lab (`~/code/emdash-local`, `http://localhost:4321`) passed `scripts/prove-lab.sh --all` after reset and the EmDash dev-bypass seed.

- Sandboxed plugin with routes, storage, one hook, and Block Kit admin
- 10 Free listing types
- 33 NYC listings (general pack plus missing types), plus reviews, a pending claim, and favorites in plugin storage
- Public lab pages: archive, detail, submit wizard, calendar, owner account
- Admin pages: Get started, listings queue, reviews, claims
- Registry publish from this Mac (listing waits on labeler approval)

## Engine (this repo)

Routes: `health`, `types`, `listings`, `search`, `submit`, `duplicate`, `reviews`, `claims`, `favorites`, `dashboard`, `contact`, `import`, `privacy`, `renew`, `admin`.

Hook: `content:afterSave` writes an index row in plugin storage.

Capabilities: `content:read`, `content:write`, `content:publish`, `schema:read`.

Storage collections: submissions, events, reviews, claims, favorites, contacts, email_log, blocked.

Settings: require moderation, default listing type, spam keywords.

Bundle: about 10.5 KB gzip. Under the 256 KB registry cap.

## Screens (lab site + site kit)

The plugin cannot ship Astro pages. The lab copies `site-kit/listora-ui.css` and owns the pages. Those pages use `--listora-*` tokens and class names (`listora-card`, `listora-grid`, wizard steps). They prove the jobs. They do **not** yet pass a side-by-side against WordPress Listora at 1440 and 390.

That gap is the next work. See [Improve the screens](../how-to/improve-the-screens.md).

## What we deliberately did not ship

- WordPress PHP, Gutenberg blocks, Interactivity API, WP-CLI
- Native EmDash plugin (React admin, Portable Text, page fragments)
- Credits, plans, Google Maps, Needs, Compare, quick view, SEO landings, lead forms, verification (skip, no Pro plan in this pass)
- GitHub Actions provenance (optional later)

## How to learn the decisions

| Note | What it answers |
| --- | --- |
| [ops/listora-as-built.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/listora-as-built.md) | What WordPress 1.9.0 actually ships |
| [ops/feature-catalog-emdash.tsv](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/feature-catalog-emdash.tsv) | Catalog rows and verdicts |
| [ops/free-first-plan.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/free-first-plan.md) | Why Free first |
| [ops/quality-plan.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/quality-plan.md) | Definition of done |
| [ops/ux-plan.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/ux-plan.md) | Screen and token plan |
| [ops/reports/drop-all.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/reports/drop-all.md) | Lab prove notes from 2026-10-13 |

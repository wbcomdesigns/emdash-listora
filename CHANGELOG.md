# Changelog

Versions match `package.json`, the git tag, and the EmDash registry release. Newest first. Never publish a version that is not on `origin/main`.

## [0.2.0] - 2026-10-13

First-run Get started plus drop-in site-kit pages so testers see a finished directory.

- New - Get started admin page with Load sample directory (12 NYC listings, reviews, a claim).
- New - Drop-in archive, detail, submit, calendar, and account pages in `site-kit/pages/`.
- New - QA catalog at `docs/qa/` for owner readiness and the screen walk.
- Improve - Directory command bar, location, Near me, sort, card rating, owner, and amenity chips.
- Improve - Health no longer writes demo rows on an empty site.
- Improve - Count copy uses singular for one listing or result.

## [0.1.0] - 2026-10-13

First registry release as `@vapvarun.bsky.social/listora`.

- Sandboxed engine: listings, search, submit, reviews, claims, favorites, dashboard, contact, import, privacy, renew
- Block Kit admin: queue, reviews, claims
- Site kit: `--listora-*` tokens, 33 NYC seed listings, archive / detail / submit / calendar / account screens in the local lab
- Publisher: `did:plc:2o6axbe264shvyedyhycyhya`

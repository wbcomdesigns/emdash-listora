# Lab and publish problems

**Included in Free**

## New machine has no `/listings/` or no lab folder

You cloned the plugin only. The host site is not in this repo. Run `./scripts/setup-lab.sh`, then `./scripts/reset-lab.sh`. Page: [Set up a new machine](../getting-started/new-machine.md).

## Health is green, `/listings/` is empty or 500

Auto-seed created collections, then media-usage aborted content inserts. Open:

`http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`

Then reload the archive. You should see about 28 published cards (expired filtered out).

## `no such table: ec_listings`

The listings collection is missing. Happens in unit tests and on a wiped DB before bypass. Plugin list helpers catch this. On the lab, run bypass. In tests, assert the empty path.

## Reviews do not show on The Golden Fork

Reviews were seeded with WordPress-style ids. EmDash uses ULIDs. Matching is by slug (`the-golden-fork`). The detail favorite and review UI must pass `data-slug`. Reseed key is `demo_seeded_v2`.

## Workerd still runs old plugin code

Rebuild, then stop and start Astro. A leftover `astro` PID keeps the old isolate.

## `MANIFEST_PUBLISHER_MISMATCH`

Active login is not `did:plc:2o6axbe264shvyedyhycyhya`. `emdash-plugin switch` or `login vapvarun.bsky.social`.

## `MISSING_BLOB_SCOPE`

Old login. `emdash-plugin logout` then login again.

## Registry install says sandbox is unavailable

The site has no `sandboxRunner`. Add workerd locally or Cloudflare `sandbox()` in production.

## Prove script misses a class that is only in CSS

`prove-lab.sh` writes HTML to a temp file and greps. Do not pipe a huge page through `echo`.

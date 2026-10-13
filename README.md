# Listora for EmDash

Sandboxed first slice of WB Listora. It is a new TypeScript plugin, not the WordPress PHP plugin.

Publisher: `did:plc:2o6axbe264shvyedyhycyhya` (`@vapvarun.bsky.social`). Registry name: `@vapvarun.bsky.social/listora`.

Source: [wbcomdesigns/emdash-listora](https://github.com/wbcomdesigns/emdash-listora). Docs: [docs/website](docs/website/README.md). How to change and ship a version: [CONTRIBUTING.md](CONTRIBUTING.md).

## What v0.1 does

The plugin is the engine (routes, storage, hooks, Block Kit admin). It does not create `/listings/` pages on install. Copy [site-kit](site-kit/README.md) onto the EmDash site after install.

- Engine: search, submit, reviews, claims, favorites, contact, import, privacy, renew
- Admin: `/_emdash/admin` then Get started, Listora queue, reviews, claims
- Kit pages (you copy): `/listings/`, `/listings/{slug}/`, `/listings/submit/`, `/listings/calendar/`, `/account/`
- `GET /_emdash/api/plugins/listora/health`

Testers install `@vapvarun.bsky.social/listora@0.2.1` only. Ignore `0.1.0` and `0.2.0`. GitHub tag, `package.json`, and the registry version are the same number.

## Docs

Read these on GitHub. They are the team handbook for this early release.

1. [Docs landing](docs/website/README.md)
2. [What we built](docs/website/getting-started/what-we-built.md)
3. [Improve the screens](docs/website/how-to/improve-the-screens.md)

Planning notes that fed the port stay in [`ops/`](ops/README.md).

Plans:

- `ops/autonomous-local-plan.md` - runbook: seeded Free prototype, reset, prove, next drop
- `ops/seed-inventory.tsv` - listings, reviews, claims the lab must contain
- `ops/listora-as-built.md` - what WordPress Listora 1.9.0 actually ships
- `ops/free-first-plan.md` - Free catalog only, what we ship next
- `ops/quality-plan.md` - definition of done, workstreams, sequence
- `ops/ux-plan.md` - screens, tokens, Listora presentation bar
- `ops/screen-parity.tsv` - WP block vs EmDash screen status
- `ops/feature-catalog-emdash.tsv` - all 76 catalog features
- `ops/typescript-plugin-plan.md` - sandboxed TS plugin slices
- `ops/prototype-plan.md` - site install + local engine lab

## Local test

First time on a machine (creates a sibling EmDash site if needed):

```bash
git clone https://github.com/wbcomdesigns/emdash-listora.git
cd emdash-listora
npm install --legacy-peer-deps
./scripts/setup-lab.sh
./scripts/reset-lab.sh
./scripts/prove-lab.sh --all
```

After that:

```bash
./scripts/reset-lab.sh
./scripts/prove-lab.sh --all
```

Default lab folder is `../emdash-local`. Override with `LISTORA_LAB`. Steps: [Set up a new machine](docs/website/getting-started/new-machine.md).

Then open:

- http://localhost:4321/listings/
- http://localhost:4321/listings/submit/
- http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin
- http://localhost:4321/_emdash/api/plugins/listora/health

Submit a listing:

```bash
curl -X POST http://localhost:4321/_emdash/api/plugins/listora/submit \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:4321" \
  -d '{"title":"Test Bakery","city":"Delhi","listing_type":"business"}'
```

The row stays a draft until you publish it in admin.

## Version control

GitHub is the source of truth. The collection is the install channel.

1. Work on a branch, prove locally, merge to `main`.
2. Bump `package.json` (patch / minor / major). See [CONTRIBUTING.md](CONTRIBUTING.md).
3. `npx emdash-plugin publish` from `main`.
4. Watch listing approval. Sites then update from Admin → Registry.

Do not republish the same version. Collection page after approval: https://plugins.emdashcms.com/plugins/@vapvarun.bsky.social/listora

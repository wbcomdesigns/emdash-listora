# Improving Listora for EmDash

This repo is the source of truth for the sandboxed plugin. WordPress Listora stays at [wbcomdesigns/wb-listora](https://github.com/wbcomdesigns/wb-listora). Do not copy PHP into this tree.

Registry identity is `@vapvarun.bsky.social/listora` (publisher DID `did:plc:2o6axbe264shvyedyhycyhya`). GitHub is where we review and version the code. New session: read [ops/handoff.md](ops/handoff.md) first.

This product is Free only. No Pro plan in this pass. Check code completion and site-owner readiness with `docs/qa/`. Do not add Compare, Needs, credits, Google Maps, lead forms, verification, or photo reviews to screens or routes. Next work stays on Free chrome. See [Not now](docs/website/pro-features/parked-work.md).

## Layout

| Path | Role |
| --- | --- |
| `src/plugin.ts` | Sandboxed routes and hooks |
| `src/admin.ts` | Block Kit admin (Get started, queue, reviews, claims) |
| `emdash-plugin.jsonc` | Identity, capabilities, storage, admin pages |
| `site-kit/` | CSS tokens and seed a site copies after install |
| `tests/` | Worker-backed route tests |
| `ops/` | Planning notes. Not shippable UI |
| `scripts/setup-lab.sh` | New machine: create sibling EmDash site, wire plugin, copy kit |

A sandboxed plugin cannot ship Astro pages. Public screens live on the site (default sibling `emdash-local`). When you change presentation, update `site-kit/` and run `./scripts/apply-kit.sh`.

## Local loop

First clone on a machine: [Set up a new machine](docs/website/getting-started/new-machine.md) (`./scripts/setup-lab.sh`). Then:

```bash
cd /path/to/emdash-listora
npm install --legacy-peer-deps
npm run validate
npm run test
npm run build
./scripts/reset-lab.sh
./scripts/prove-lab.sh --all
```

Lab: http://localhost:4321/listings/  
Admin: http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin

Keep the plugin wired as a local package (`file:` or symlink) until the new version is published and approved.

## Versioning

`package.json` `version` is the registry version. Releases are immutable. Bump before every `emdash-plugin publish`. Never reuse a version. Do not use `--allow-overwrite`.

| Bump | When |
| --- | --- |
| **patch** | Fix, copy, seed, or test change. Same hooks, routes, and capabilities |
| **minor** | New hook, route, setting, or admin page |
| **major** | Broader trust contract (new capability, new `allowedHosts`, or a public mutation) |

After the bump, add a `CHANGELOG.md` entry under `[Unreleased]`, then move it under the new version on release.

## Branch and commit

1. Branch from `main`: `feat/...`, `fix/...`, or `docs/...`.
2. Keep `emdash-plugin.jsonc` aligned with `src/` (every capability, host, and storage collection the code uses).
3. No Node built-ins in plugin runtime (`fs`, `path`, `child_process`). Use Web APIs.
4. Stay under the registry cap: 256 KB uncompressed, 128 KB per file, 20 files.
5. Run `npm run validate && npm run test && npm run build` before you open a PR.
6. Update `docs/website/` in the same PR when a route, screen, or install step changes. Start from [docs/website/README.md](docs/website/README.md). Follow the `sections[]` shape in `docs_config.json`.
7. Add or change the matching case in `docs/qa/QA_CHECKLIST.md` when behaviour changes. Walk member cases with `./scripts/lab-role.sh subscriber`, not only as admin.
8. Commit subject + body only. No AI co-author trailers. No em-dashes.

## Release to the collection

`package.json` version, the `CHANGELOG.md` heading, the git tag `vX.Y.Z`, and the registry package must be the same number. Do not leave GitHub ahead of the registry, or the other way around.

A registry release cannot be changed or removed. Every check runs before `publish`, never after.

### Before you merge

1. `npm test` and `npm run build`.
2. `./scripts/reset-lab.sh` then `./scripts/prove-lab.sh --all`.
3. Walk [docs/qa/QA_CHECKLIST.md](docs/qa/QA_CHECKLIST.md) in a browser as guest, member (`./scripts/lab-role.sh subscriber`) and admin, at 1440, 768 and 390, in light and dark. Update its "Last walk" line honestly.
4. Wait for the automatic security review of the last pushed commit and fix what it finds. Do not tag while a review is outstanding.
5. Same version in `package.json`, `package-lock.json`, `CHANGELOG.md`, the top of `docs/registry/changelog.md` (the registry caps that section at 2000 characters) and a new `docs/website/whats-new/` page.
6. If screens changed, retake `images/screenshot-*.jpg` from a freshly reset lab. No test data in them.
7. `npm run bundle` stays under 256 KB, 128 KB per file, 20 files.

### Publish, from `main` after the PR is merged

1. `npm test && npm run build` on `main`.
2. Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
3. Session: `npx emdash-plugin whoami`. If needed: `npx emdash-plugin login vapvarun.bsky.social`
4. Publish: `npx emdash-plugin publish`
5. Profile: `npx emdash-plugin update-package` (dry run), then `--yes`. `publish` does not update the name, description, keywords or sections of an existing package.
6. GitHub release: `gh release create vX.Y.Z` with that version's changelog section.
7. Status: `npx emdash-plugin info vapvarun.bsky.social listora --version X.Y.Z`. A new release stays off the public page until its listing check passes. `pending` with no reason code means not assessed yet.
8. Open the public page and look at the icon, banner and screenshots. Comment on the milestone's progress-log issue. Rewrite `ops/handoff.md`. Reset the lab.

A review finding that arrives after publish gets a patch release only if a site owner is exposed. Otherwise file an issue for the next milestone, so GitHub and the registry stay on the same version.

Public page after approval:  
https://plugins.emdashcms.com/plugins/@vapvarun.bsky.social/listora

If login predates blob scopes, `logout` then `login` again. If publish says `MANIFEST_PUBLISHER_MISMATCH`, switch to the pinned DID. Do not change `publisher` unless the Atmosphere account is really moving.

GitHub Actions (`emdash-plugin release setup`) is optional. Use it later if you want provenance-backed releases. Direct `publish` from this machine is enough.

## Site install of a new version

Sites with a sandbox runner: Admin → Registry → `@vapvarun.bsky.social/listora` → update. Review the consent dialog when capabilities change. Copy any new `site-kit/` files into the site if pages or tokens changed.

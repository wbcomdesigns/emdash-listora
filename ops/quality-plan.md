# Listora on EmDash: proper plan

Goal: the EmDash product does the same **jobs** as WordPress Listora and looks like the same **product**. Feature JSON without Listora chrome is a failed port.

Three documents work together:

| Doc | Answers |
| --- | --- |
| `feature-catalog-emdash.tsv` | All 76 catalog features, verdict, slice |
| `typescript-plugin-plan.md` | Sandboxed TypeScript engine, slices A-J |
| `ux-plan.md` | Screens, tokens, interactions, quality gates |

This file is the order of work and the definition of done.

## Split that cannot move

| Piece | Owns | Cannot own |
| --- | --- | --- |
| `@wbcomdesigns/listora` | Routes, storage, hooks, Block Kit admin | Astro pages, Gutenberg, PHP, credits SDK |
| Site kit | `listora-ui.css`, cards, search, detail, wizard, dashboard, maps | Content APIs |
| Host EmDash | Auth, roles, SEO tags, sitemap, sandbox | Directory chrome |
| Compose (later) | Credits, plans, coupons, payments | Listing UI |

WordPress `wb-listora` stays the PHP product and the **visual reference**. Screenshot it. Do not import it.

## Definition of done (product)

A catalog row is done only when all of these are true:

1. TSV verdict is implemented (`SANDBOXED` / `COLLECTION` / `THEME` / `HOST` / `COMPOSE`).
2. The paired UX screen in `ux-plan.md` exists.
3. Side-by-side screenshots vs WP Listora pass at 1440 and 390.
4. Empty, loading, error, and populated states exist.
5. Plugin tests cover the route. Browser path covers the screen.

Slice A today fails (3) and (4) on public pages. Engine is proven. Presentation is not.

## Workstreams (run in parallel, ship together)

### 1. Engine (`~/code/emdash-listora`)

Stay sandboxed. Follow `typescript-plugin-plan.md` slices A-J. Catalog is the backlog.

### 2. Site kit (extract from lab, then rebuild UI)

New folder, not more one-off pages in `emdash-local`:

```text
site-kit/
  listora-ui.css          tokens + components (ported)
  components/             Card, Search, Grid, Detail, Wizard, Dashboard
  pages/                  drop-in Astro routes
  seed/listings.json      collection + taxonomies
```

First kit drop rebuilds the three lab pages to Listora chrome. That is the UX start of slice A, not a new plugin version.

### 3. Local lab

`emdash-local` stays the first host. After kit extract, the lab only consumes the kit. A second clean site must be able to do the same.

## Sequence

Free only. See `ops/free-first-plan.md`. Pro stays out of this product.

Execution loop, seed, and local prove: `ops/autonomous-local-plan.md`. Seed rows: `ops/seed-inventory.tsv`.

1. **A-UI (now).** Rebuild archive, detail, submit against `ux-plan.md`. Keep current plugin routes. Seed the 25+ listing inventory in the same drop.
2. **Kit + types (B).** Extract `site-kit/`. Types, taxonomies, hours, gallery, spam.
3. **Search + OSM + calendar (F, Free only).**
4. **Reviews + claims (D+E, Free only).**
5. **Dashboard + favorites (C).**
6. **Contact + email + import (G+I, Free only).**
7. **Registry publish** after Drops 1-2 look like Listora Free. Do not start Pro or credits.

## Local testing

Engine checks stay in `prototype-plan.md`.

UX checks (new, required):

| Check | Pass |
| --- | --- |
| Card vs WP | Photo, type, location, not title-only |
| Search | Facets or an explicit "not in this drop" note on the screen |
| Detail | Gallery or placeholder, tabs or sections matching WP, hours if present |
| Submit | Steps visible, one primary Continue/Submit, field errors on the field |
| 390px | No horizontal scroll, 44px taps |
| Dark | Tokens flip, text still AA |
| Empty | Icon + title + body + CTA |

Render on localhost and look. A 200 is not a pass.

## Roles

| Actor | Does |
| --- | --- |
| Plugin engineer | Slices, tests, bundle cap |
| UX / site-kit engineer | `listora-ui.css`, components, side-by-side |
| Site engineer | Install plugin, apply kit, sandbox, menu |
| Site admin | Queue, types, settings |

## Out of quality scope (do not fake)

BuddyPress activity, WP-CLI, WP licence, Gutenberg editor, App Sign-In with a WordPress password. Those catalog rows are SKIP. Do not build a half UI for them.

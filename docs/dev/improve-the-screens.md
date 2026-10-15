# Improve the screens

**Included in Free**

This is the working queue after `0.2.1`. Engine drops 1-6 are in the lab. Presentation is still the product gap. Current next PR: [ops/handoff.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/handoff.md).

Do not add Pro jobs. Do not add native-plugin features. Do not restyle listings as blog posts.

## Priority

### 1. Make the kit the source of screens

Pages are now in `site-kit/pages/`. A second site still has to copy them. Next is prove that copy on a clean site. Target:

```text
site-kit/
  listora-ui.css
  components/     Card, Search, Grid, Detail, Wizard, Dashboard
  pages/          drop-in Astro routes
  seed/           collection, taxonomies, listings
```

A change without a kit update is a lab-only patch. It will not survive the next site.

### 2. Rebuild the four public screens first

Archive, card, detail, submit. These are the ones customers judge. Side-by-side against WordPress at 1440 and 390. Empty, loading, error, populated. Light and dark.

Stop calling those screens done until the gate in [Match Listora chrome](match-listora-chrome.md) passes.

### 3. Then the rest of Free chrome

- Category icon grid
- Archive paging, empty / loading / error
- Calendar month plus phone agenda
- Dashboard left nav with real account URLs
- Map cluster and drag-search
- Review summary and owner reply
- Admin empty states and a real settings IA

### 4. Capture screenshots only after the bar

Docs stay without product screenshots until the lab looks like a model directory. Do not commit QA or blog-theme frames. When you capture: 1440 and 390, real NYC seed names, WebP under `docs/website/images/`, relative paths.

## Pair engine and UI

Do not ship a plugin route change without the screen that uses it. If you add a facet, the archive toolbar ships in the same PR.

## Suggested next PR

Follow [ops/handoff.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/handoff.md). Short version:

1. Prove `setup-lab.sh` on a clean second EmDash site.
2. Archive: category icon grid, paging, empty / loading / error.
3. Extract Card + Grid + Search into `site-kit/components/`.
4. Update this inventory and `CHANGELOG.md` under Unreleased. Next kit/UX release is `0.2.2`.
5. Do not add Pro jobs.

## Planning files

Use these, then keep this page honest when reality changes:

- [ops/ux-plan.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/ux-plan.md)
- [ops/quality-plan.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/quality-plan.md)
- [ops/screen-parity.tsv](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/screen-parity.tsv)
- [ops/feature-catalog-emdash.tsv](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/feature-catalog-emdash.tsv)

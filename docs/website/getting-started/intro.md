# What Listora on EmDash is

**Included in Free**

Listora on EmDash is a new TypeScript plugin. It is not the WordPress PHP plugin running inside Astro. EmDash is Astro plus a sandboxed plugin runtime. PHP, Gutenberg, WP-CLI, and BuddyPress do not load here.

This repo is the source of truth: [wbcomdesigns/emdash-listora](https://github.com/wbcomdesigns/emdash-listora). The install channel is the EmDash collection: `@vapvarun.bsky.social/listora`. WordPress Listora stays at [wbcomdesigns/wb-listora](https://github.com/wbcomdesigns/wb-listora) and is the visual reference, not the runtime.

## Who this docs set is for

The product is early (`0.1.0`). These pages are for the Wbcom team first: what we already proved, what is still thin, and where UX and presentation work starts. Customer-facing screenshots wait until the screens pass the Listora chrome bar.

## Two products, one job

A listing directory for restaurants, hotels, jobs, events, and the other Free types. Visitors search and read. Owners submit and manage. Admins moderate.

| Product | Stack | Where it lives |
| --- | --- | --- |
| WB Listora | WordPress, PHP, Gutenberg | `wb-listora` |
| Listora for EmDash | Astro, TypeScript, Block Kit | this repo |

Do not port PHP files. Port jobs and chrome.

## Read next

1. [What we built in 0.1.0](what-we-built.md)
2. [Plugin, site kit, and host](../architecture/split.md)
3. [The presentation bar](../ux/presentation-bar.md)

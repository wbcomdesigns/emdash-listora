# Plugin, site kit, and host

**Included in Free**

This split does not move. Mixing the layers is how a WordPress habit breaks an EmDash site.

## Who owns what

| Layer | Owns | Cannot own |
| --- | --- | --- |
| Sandboxed plugin (`src/`) | Routes, storage, hooks, Block Kit admin, settings | Astro pages, CSS in the visitor theme, React admin |
| Site kit (`site-kit/`) | `--listora-*` CSS, seed listings, copy-paste page recipes | Content APIs, sandbox code |
| Host EmDash | Auth, roles, collections, SEO tags, sandbox runner | Directory chrome |
| Compose (later) | Credits, plans, payments | Listing UI |

The site must declare a `listings` collection. The plugin reads and writes that collection. If the collection is missing, listings routes return empty (they catch a missing table instead of crashing).

## Why pages are not in the plugin

A sandboxed plugin is a Worker isolate. It may return JSON and Block Kit. It may not ship `.astro` files or browser React. Native plugins can do more, and they cannot go on [plugins.emdashcms.com](https://plugins.emdashcms.com/). We stay sandboxed so the collection install works.

That is why every public screen has two halves:

1. Data from `/_emdash/api/plugins/listora/...`
2. Markup and CSS on the site

When you change a card, change `site-kit/listora-ui.css` and the lab page together. When you change a field, change `src/` and the seed together.

## Lab site

`~/code/emdash-local` is the first host. It is not this git repo. After a kit change, copy CSS into `src/styles/listora-ui.css` on the lab (reset script does the mechanical bits). A second clean site should be able to consume the same kit. That is not proven yet. Making the kit drop-in is part of the UX work.

# Listora 0.8.0 scope

**Status: LOCKED on 2026-11-14.** Decided with the owner on 2026-11-13 and 2026-11-14 (see `ops/plan-emdash-1.5-and-0.8.0.md`, section D). An agent does not add options, change decisions or move items in or out. If an item cannot be built as written, stop, say why on its issue, and wait for the owner.

Free only. Generic: every item is for any EmDash directory owner, not shaped around one site. Registry install is the product. Check every EmDash API, hook and config in the `emdash-docs` MCP first; where the docs are silent, read `node_modules/emdash` (1.5.0) and say so.

## Decisions

| Question | Decision |
| --- | --- |
| Type editor | Yes (reopens #28): WordPress Listora Free ships custom types and fields |
| Built-in types | The 10 current types plus Software. Built-ins can be edited and hidden, never deleted. Custom types can be deleted only while no listing uses them |
| Field kinds | Six: text, number, choice from a list, link, date, yes/no. No multi-choice (categories and tags cover it) |
| Sortable fields | Three number or date fields per type (`n1` to `n3`). The sort is offered only once a type is picked |
| Types without a location | A per-type yes/no. Off hides map, city, hours, directions, Open or Closed, location search and address on every surface |
| Software type | Built in, one type for skills, agents, plugins, MCP servers, apps, libraries and themes. Location-less. Fields and look below |
| Live GitHub data | No `network:request` capability (it makes every site re-approve the plugin). The site kit reads GitHub's public API in the visitor's browser; an outside sync may write the fields |
| Member listings | A listing a member adds counts as theirs (0.7.0, unchanged) |
| Internal state | Moves from `ctx.settings` to `ctx.kv` under `state:` (#89). Owner settings stay in settings |
| Indexes | Composite indexes for every filter + order query (#88); unused ones removed |

## In scope

1. **Types store.** All types (built-in and custom) live in one KV record (`config:types`), read once per call and budgeted. Built-ins are seeded from code; an owner's changes are stored over them. Listings store their raw type slug; names, colours, icons and schema types are looked up at read time. Unknown slugs show as their slug, never as Business.
2. **Every reader of the fixed types** moves to the store: `src/lib/types.ts`, `src/lib/catalog.ts` (`listingTypeBySlug`), page:metadata, the kit copy (`site-kit/lib/listora.ts` LISTING_TYPES), the in-text block, the manifest's `default_listing_type` options, the sample directory, the submit form, CSV import, admin labels and the `types` route.
3. **Type editor (admin, Block Kit).** A Types page: list (name, colour, listings using it, location yes/no, shown or hidden), a type form (name, schema.org type from a fixed list, colour from a fixed list, icon from a fixed list, has a location), and per type a fields table plus an add-field form (label, kind, options for choice, required, shown on cards, sort slot). One field per submit (no repeater on admin pages). Edit and remove a field; a removed field's stored values are left in place and no longer shown.
4. **Field values.** Stored in the listing's `type_fields` object. The kit submit and edit forms render the chosen type's fields with the right inputs and validation; the listing page shows them in a Details section; cards show the fields marked "on cards". CSV import and export carry them as columns named by field label.
5. **Sort slots.** The directory index gains `n1`, `n2`, `n3` per listing, filled by the content hooks from the type's field-to-slot map (dates as epoch numbers). Composite indexes `["vis","type","n1"]` and the same for `n2`, `n3`. The `listings` route accepts a slot sort only with a type.
6. **Location-less types.** Every surface checks the type's has-location flag: directory filters and map, listing page (map, hours, directions, Open or Closed, address), submit form, page:metadata (no address or geo).
7. **Kit directory on the index.** `site-kit/pages/listings/index.astro` stops reading the collection (limit 500) and pages through the `listings` route with its cursor, so filters and sorts work on any size.
8. **Keyword search through core.** Keywords use EmDash's own site search; the index handles type, category, city and sort. The stored card drops the long description to keep rows small.
9. **Software type.** Fields: What it is (choice: Plugin, Skill, Agent, MCP server, App, Library, Theme; filter chips), Works with (choice: WordPress, EmDash, Claude Code, Cursor, VS Code, npm, Python, Any), Repository (link; main button), Homepage or docs (link), Install command (text; escaped code box with Copy, never run), Version (text), License (choice: MIT, GPL, Apache, BSD, Proprietary, Other), Price (choice: Free, Freemium, Paid), Open source (yes/no), Stars or installs (number, slot 1), Last release (date, slot 2), Released (date, slot 3). Structured data `SoftwareApplication`. Links on member-submitted listings carry `rel="nofollow ugc"`. Kit: Software card and listing-page sections (Install, Details, screenshots from the photo feature, reviews, poll slot, Maintained by or Claim), live GitHub stars and latest release read in the browser when the repository is on github.com. Two or three Software listings in the sample directory.
10. **Internal state to KV (#89).** `state_fields`, `state_terms`, `kit_pages_done`, `state_ready`, `upgrade_0_7`, `state_tasks`, `view_*`: read the new key, fall back to the old one, write the new one, safe to repeat; the old keys are deleted once copied.
11. **Composite indexes (#88)** for `public.ts:168`, `member.ts:309`, `member.ts:630`; remove `directory.cl` and the unused `events` indexes; the `blocked` collection gets its admin screen or is removed (decide from code: if nothing an owner does writes it, remove it).
12. **Outside-source sync guide** (developer docs): create, update and publish through the content API with `_rev`, throttle, handle 409 and STORAGE_INDEXES_NOT_READY, check the index afterwards. The nightly sweep gets a follow-on run so a full repair of 6,000 listings takes hours, not days.
13. **Low fixes carried in:** #91 (stale waiting count in decision buttons; guard the visitor upgrade nudge with a short KV mark), #87 (walk lows), and the starter's #9 fallback when `crypto.subtle` is missing (change the starter first, copy byte for byte).

## Out of scope

Per-type moderation; maps or location for software; paid features (plans, credits, coupons, featured payments); a native (trusted) block beyond the existing one; multi-choice fields; a `network:request` capability; Google Maps; anything in `.claude/CLAUDE.md`'s do-not-add list.

## Upgrade

0.8.0 adds indexes, so a site answers `503 STORAGE_INDEXES_NOT_READY` on writes for a short time after updating; the kit already says "finishing an update". The data step (types record seed, state to KV, slot backfill through the sweep) runs by itself using the 0.7.1 mechanisms (version marker in the hourly task, visitor nudge, alternating one-shot names) and is measured at every step.

## Done means

Every item works from the registry install on the Node lab and the Cloudflare testbed, as guest, member, editor and admin, at 1440, 768 and 390, light and dark, keyboard; every entry point at 9 calls or fewer on a 2,000-listing and a 6,000-listing directory; the release gate (`references/release-gate.md`) passes with its evidence.

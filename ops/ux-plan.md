# Listora on EmDash: UX plan

A catalog row is not done when the route returns JSON. It is done when the **rendered screen** matches WordPress Listora's build quality.

The current lab pages (`/listings/`, `/listings/[slug]/`, `/listings/submit/`) are a thin blog-style proof. They fail this plan. They prove the engine. They are not the product UI.

**Design read:** directory product UI for visitors and listing owners, using Listora's own tokens and block chrome, not a blog archive and not a marketing landing.

Public and owner UI follows `ux-foundation` (tokens, 40px taps, focus rings, empty primitive, Lucide, RTL, light/dark). Page correctness follows `web-page-spec`. Marketing taste-skill does not apply to these screens.

Admin chrome is EmDash Block Kit (Kumo). We match Listora **information architecture and completeness**, not wp-admin pixels.

Visual source of truth: WordPress Listora on a real site (blocks + `listora-*` CSS), not the EmDash blog theme.

## What "same quality" means

| Layer | WordPress Listora | EmDash target |
| --- | --- | --- |
| Tokens | `--listora-*` in `src/variables/` | Port into site-kit `listora-ui.css`. Inherit host `--brand` the same way |
| Components | One vocabulary: card, badge, button, empty, form-field, tabs, page-shell | Same class names and states in the kit |
| Blocks | 11 Free + 5 Pro layout-owning blocks | Same screens as Astro components. No Gutenberg |
| Motion | Search without reload, skeletons, carousel, map drag-search | Same behaviours via site JS + plugin routes |
| A11y | 44px tap, Lucide, RTL sheets, Open/Closed live status | Same. `prefers-reduced-motion` on carousels and maps |
| Isolation | `.listora-block` so the theme does not restyle internals | Kit mounts inside a `.listora-block` root on EmDash pages |

Do not restyle listings as blog posts. A Listora card has type badge, location, rating, features, owner, featured treatment, and photo. The lab list is title + excerpt only.

## Token and CSS port

Copy from `wb-listora`, do not invent a second system:

- `src/variables/colors.css`, `spacing.css`, `typography.css`, `radius.css`, `shadow.css`, `motion.css`
- Components: `button`, `badge`, `card`, `form-field`, `empty-state`, `tabs`, `table`, `modal`, `page-shell`
- Block CSS for each screen we ship

Ship **one** kit file: `site-kit/listora-ui.css` (plus RTL). No per-page `<style>` islands like the current lab pages.

Tap target: `--listora-tap-target: 44px`. Brand text uses `--listora-primary-text` for small labels (Listora already darkens brand for AA).

Icons: Lucide only, stroke 1.75.

## Public screen inventory

Each screen needs empty, loading, error, populated, 1440px, 390px, light, dark. Status is against WordPress Listora, not against "it loads".

| Screen | WP source | EmDash now | Parity bar |
| --- | --- | --- | --- |
| Directory search | `listing-search` | Missing | Command-style search, Near Me, type chips, advanced facets (category, feature, price, rating) |
| Directory grid | `listing-grid` | Thin list | Grid + list toggle, count, sort, numbered or cursor paging, skeletons |
| Listing card | `listing-card` | Title + excerpt | Photo, type badge, location, rating, features, tags, owner, featured |
| Listing detail | `listing-detail` | Facts list | Gallery + lightbox, tabs (Details, Reviews, Contact), sidebar, map + directions, hours Open/Closed, Share / Favorite / Claim / Compare |
| Reviews | `listing-reviews` | Missing | Average + distribution, list, form, helpful, report, owner reply |
| Map | `listing-map` | Missing | OSM default, clustering, "showing N of M", search on drag |
| Submit wizard | `listing-submission` | One flat form | Type -> Basic -> Type fields -> Categories -> Preview. Back, Save draft, Continue, duplicate warning |
| Categories | `listing-categories` | Missing | Icon grid, counts, view-all, empty |
| Featured | `listing-featured` | Missing | Carousel, arrows, dots |
| Calendar | `listing-calendar` | Missing | Month grid, agenda on phone |
| User dashboard | `user-dashboard` | Missing | Left nav (tabs on small): Overview, My Listings, Reviews, Claims, Favorites, Profile. Pro: Credits, Saved searches, Needs |
| Compare | Pro `comparison` | Missing | 2-4 listings, one table |
| Needs | Pro needs-grid + post-need | Missing | Buyer form + filtered grid |
| Quick view | Pro | Missing | Modal from card, not a navigation |
| SEO landing | Pro `/type-in-location/` | Missing | Same card chrome as the directory |
| Coming soon | Pro | Missing | Gate page, not a 404 |

## Admin screen inventory (Block Kit)

EmDash renders blocks. We cannot ship `listora-admin.css`. Quality here means: every Listora admin job exists, with a table or form, empty state, and one primary action.

| Job | WP Listora | EmDash Block Kit |
| --- | --- | --- |
| Moderation queue | Listings / reviews / claims queues | `/queue` exists for listings. Add reviews + claims |
| Listing types | Type editor | `/types` (slice B) |
| Settings | Sidebar settings | `/settings` sections: submit, search, maps, reviews, spam |
| Import / export | Visual + CSV | `/import` |
| Analytics | Per-listing + directory | `/analytics` |
| Email templates | Template list | `/emails` |
| Audit log | Transitions | `/audit` |
| Setup | 6-step wizard | Site-kit apply, not a PHP wizard |

Menu order (match Listora admin rule): Overview, Content, Moderation, Users (host), Monetize (compose), Insights, Tools, Settings last.

## Interaction contract (do not drop)

These are why Listora feels finished. JSON-only ports fail if they skip them.

1. Search updates the grid without a full reload (fetch `search` / `listings`, swap cards, keep focus).
2. Submit is a wizard with a live step list, autosave, and a preview that looks like a real card.
3. Duplicate check runs as the title is typed, with a link to the existing listing.
4. Hours show **Open now / **Closed** in the listing timezone, including overnight ranges.
5. Map drag re-queries. Marker overflow states the cap.
6. Dashboard tabs are real URLs (`/account/listings/`, not JS-only).
7. Empty states use icon + title + body + CTA. Never a lone "No listings yet."
8. Every public write has inline field errors, not only a top banner.

## Slice pairing (engine + UI together)

Do not ship a plugin slice without its screens.

| Plugin slice | UX that must ship in the same drop |
| --- | --- |
| A (now) | Rebuild archive, detail, submit to Listora chrome (card, detail shell, wizard). Lab pages are temporary |
| B | Type picker UI, hours editor, gallery uploader, featured badge, category/feature chips |
| C | Dashboard shell + My Listings + favorites + duplicate inline warning |
| D | Claim CTA on detail + claim form + admin claims table |
| E | Reviews block on detail + review form |
| F | Search bar + facets + grid toolbar + map + calendar + compare |
| G | Contact / lead form, email settings pages |
| H | Needs grid + post need + dashboard tabs |
| I | Import admin page |
| J | Credit purchase + plan picker on submit (compose + kit) |

## Quality gates before a screen is "done"

1. **Side-by-side:** screenshot WP Listora and the EmDash screen at 1440 and 390. Card, search, detail, and submit must be recognisably the same product.
2. **web-page-spec** required items on every public page.
3. **ux-foundation:** tokens only, 44px taps, `focus-visible`, empty primitive, no raw hex in new CSS.
4. **States:** empty, loading skeleton, error, populated.
5. **Theme:** light and dark, and the kit still wins inside `.listora-block` when the host blog theme is active.
6. **RTL:** logical properties, no left/right in new CSS.
7. **Keyboard:** wizard steps, facet panel, map is skippable, no focus trap except dialogs.
8. **Reduced motion:** carousels and map fly-to become instant.

A 200 status is not a pass.

## What we will not do

- Leave the blog-style listing list as the public UI.
- Invent a new visual language "because EmDash is Astro".
- Pixel-clone wp-admin into Block Kit.
- Ship Gutenberg or Interactivity API on EmDash.
- Call slice A complete for customers until archive, detail, and submit pass the side-by-side gate.

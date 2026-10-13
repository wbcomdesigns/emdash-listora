# Match Listora chrome

**Included in Free**

A catalog row is not done when the route returns JSON. It is done when the rendered screen matches WordPress Listora's build quality.

The lab pages prove the engine. They are not the product UI yet. Do not leave the blog-style list as what we show customers. Do not invent a new look because the host is Astro.

## Same quality means

| Layer | WordPress Listora | EmDash target |
| --- | --- | --- |
| Tokens | `--listora-*` | Port in `site-kit/listora-ui.css`. Inherit host `--brand` |
| Components | card, badge, button, empty, field, tabs, page-shell | Same class names and states |
| Layout | 11 Free blocks own the screens | Same screens as Astro. No Gutenberg |
| Motion | Search without reload, skeletons, map drag | Site JS plus plugin routes |
| A11y | 44px tap, Lucide, RTL, Open/Closed | Same. `prefers-reduced-motion` on carousels and maps |
| Isolation | `.listora-block` | Kit mounts inside that root so the blog theme cannot restyle internals |

A Listora card has type badge, location, rating, features, owner, featured treatment, and photo. Title plus excerpt is a miss.

## Gates before a screen is done

1. Side-by-side screenshot versus WordPress Listora at 1440 and 390. Card, search, detail, and submit must look like the same product.
2. `web-page-spec` required items on every public page.
3. `ux-foundation`: tokens only, 44px taps, `focus-visible`, empty primitive, no new raw hex.
4. Empty, loading skeleton, error, and populated states.
5. Light and dark. The kit still wins inside `.listora-block`.
6. RTL: logical properties only in new CSS.
7. Keyboard: wizard, facets, skippable map. No focus trap except dialogs.
8. Reduced motion: carousels and map fly-to become instant.

A 200 status is not a pass.

## Design skills

Public and owner UI: `ux-foundation` then `web-page-spec`. Admin: Block Kit, match information architecture. Marketing `taste-skill` does not apply to directory screens.

Visual source: WordPress Listora blocks and CSS, not the EmDash blog theme.

Forms (submit, review, contact, claim, search) follow [Form presentation](form-presentation.md). That page is `ux-foundation`. `taste-skill` does not style those forms.

Longer plan: [ops/ux-plan.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/ux-plan.md).

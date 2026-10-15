# Form presentation

**Included in Free**

Reading this as directory product UI for listing owners and visitors, with Listora tokens. Forms are `ux-foundation`. They are not `taste-skill`.

`taste-skill` is for public marketing surfaces (listora.org, store, campaign pages). Trust-first docs use dials 5 / 3 / 4. Directory screens, wizards, reviews, claims, contact, and Block Kit admin use the Listora kit and the rules below.

## Which skill

| Surface | Skill | Why |
| --- | --- | --- |
| Submit, search, review, contact, claim, dashboard | `ux-foundation` | Product forms and lists |
| Block Kit admin | `ux-foundation` IA, not wp-admin pixels | Pattern C list / Pattern A settings |
| listora.org or a launch landing | `taste-skill` then `web-page-spec` | Marketing only |
| These GitHub docs | wbcom-documentation | Text first, no form chrome |

Do not restyle a Listora form to look like a marketing hero. Do not invent a second field language.

## Field anatomy

Every public write uses this stack. Placeholder is never the label.

```html
<div class="listora-field">
  <label class="listora-label" for="title">Listing title</label>
  <input id="title" class="listora-input" name="title" aria-required="true" aria-describedby="title-help title-error" />
  <p class="listora-helper" id="title-help">Use the public business name.</p>
  <p class="listora-field-error" id="title-error" hidden>Enter a title.</p>
</div>
```

| Rule | Do |
| --- | --- |
| Label | Visible, above the control, `for` matches `id` |
| Control | 44px min height (`--listora-tap-target`). Tokens only |
| Helper | Optional, under the control, linked with `aria-describedby` |
| Error | Text plus `aria-invalid="true"` plus `.is-invalid`. Not color alone |
| Required | `aria-required="true"` and a text mark on the label, not only a red star color |
| Checkbox | `.listora-check`: box then label, 44px hit area |
| Honeypot | `.listora-honeypot`, `tabindex="-1"`, `autocomplete="off"`, not in the tab order |
| One primary | Continue or Submit is the only filled button on that step |

Banned: placeholder-as-label, inline `style` on fields, `alert()`, a lone top banner with no field error, `<input type="number">` defaulting to `-1`.

## Forms we have to present

| Form | Page | Must show |
| --- | --- | --- |
| Submit wizard | `/listings/submit/` | Five named steps, Back / Continue, title error, duplicate warning, terms check, success status |
| Directory search | `/listings/` | Command bar: `sr-only` Search and Location labels, Near me, Search submit, type chips. No Advanced Search |
| Review | listing detail | Stars, title, body, inline errors |
| Contact | listing detail | Name, email, message, honeypot |
| Claim | listing detail | Name, email, proof |
| Admin queues | Block Kit | Empty primitive, one primary action |

Wizard steps use the real names: Type, Basics, Details, Categories, Preview. Not "Step 1". Steps are buttons (or links) so keyboard users can move. The active step is `aria-current="step"`.

Type is a radio card grid (`.listora-type-card`), not a lone select. Each step sits in `.listora-form-section`. Related fields use `.listora-form-grid` (two columns, one column under 1024px). Every control uses `.listora-input`.

Preview must look like a `listora-card`, not a dump of raw fields.

Do not add Pro fields or controls to these forms. Off: Compare, Needs, credits, Google Places, lead-form extras, verification, photo reviews, saved searches. The type cards are the 10 Free defaults. They are not a Pro catalog.

## States

Every form ships empty, loading, error, and success.

- Empty: `.listora-empty` with icon, title, body, CTA. Never "No listings yet."
- Loading: disable the primary button and set `aria-busy="true"` on the form
- Error: field-level first; status banner only for server or network failure
- Success: status banner with `data-tone="success"`, then a next action (view queue, add another)

## Tokens and motion

- Colors, space, radius, and tap size come from `--listora-*`
- Focus: `:focus-visible` and `--listora-focus-ring`. Never `outline: none` without a ring
- Icons: Lucide, stroke 1.75
- RTL: `margin-inline-*`, `inset-inline-*`
- Dark: override tokens on `.listora-block`, not per-field hex
- `prefers-reduced-motion: reduce` already shortens `--listora-transition-base`

Responsive kit CSS keeps two layout queries at the bottom (1024px, 640px). Do not add more breakpoints.

## Admin

Block Kit pages follow Pattern C (queue) and later Pattern A (settings sidebar). One primary action. Empty primitive. No native `confirm()`.

## Check before you ship a form

- [ ] Label above every control, including search
- [ ] 44px taps on inputs, selects, checkboxes, and wizard steps
- [ ] Helper and error ids wired with `aria-describedby`
- [ ] Invalid field focused
- [ ] Light and dark both readable (AA)
- [ ] 390px and 1440px
- [ ] No marketing gradients, Inter-as-default, or three equal promo cards on the form
- [ ] No Compare, Needs, credits, verification, or other Pro controls

When a form changes, update this page and [Directory screens](directory-screens.md) in the same PR.

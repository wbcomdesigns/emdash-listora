# Submit a listing

**Included in Free**

Public form: `/listings/submit/`. POST: `/_emdash/api/plugins/listora/submit`.

## What works in 0.1.0

- Five steps: type, basics, type fields, categories, preview
- Title required, 200 character cap
- Honeypot field `company_website`
- Spam keyword list from settings
- Rate limit stored in `ctx.kv`
- Duplicate check route
- Default: create a `listings` draft when moderation is on
- Host generates the slug. Do not send `slug` on create

## What is still thin

WordPress has autosave, a live step list that feels like the block, a preview that looks like a real card, and inline duplicate warnings as the title is typed. The lab wizard proves the path. It is not yet that product.

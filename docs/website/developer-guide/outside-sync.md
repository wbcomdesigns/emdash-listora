# Sync listings from an outside source

**Included in Free**

Use this when a script keeps your directory in step with another system: a CRM, a spreadsheet, a package registry, GitHub. The script writes listings through EmDash's own content API. Listora needs no route of its own for this: every listing EmDash publishes reaches the directory through Listora's content hooks.

## Before you start

- Create a personal access token for a user who may publish listings (an Editor or Admin). Send it as `Authorization: Bearer <token>`.
- Use the field names of your `listings` collection: `title`, `excerpt`, `description`, `listing_type`, `city`, `address`, `phone`, `website` and the rest. A listing type's own fields go in `type_fields` as a JSON text, keyed by each field's key (see [Listing types](../features/listing-types.md)).
- Listings written this way skip Listora's Listings queue. They are published by you, not sent by a member, so they have no owner and never expire.

## Add a listing

1. **Create it as a draft.** `POST /_emdash/api/content/listings` with `{ "slug": "...", "status": "draft", "data": { ... } }`. Keep the `id` from the answer.
2. **Set its categories.** `POST /_emdash/api/content/listings/<id>/terms/listing_category` with `{ "termIds": ["<term id>", ...] }`. A listing may have several. Set them before you publish: Listora reads a listing's categories when it is published.
3. **Read it.** `GET /_emdash/api/content/listings/<id>` returns `_rev`, the entry's revision.
4. **Publish it.** `POST /_emdash/api/content/listings/<id>/publish` with `{ "_rev": "<from step 3>" }`.

## Change a listing

1. `GET /_emdash/api/content/listings/<id>` and keep `_rev`.
2. `PUT /_emdash/api/content/listings/<id>` with only the fields that changed and that `_rev`. On a published listing this saves a draft; the live listing stays as it was.
3. Publish with the `_rev` the PUT returned. Publishing is what brings Listora's directory up to date.
4. Changed only the categories? Set them (step 2 above), then read and publish again, so the directory files the listing under its new categories.

Always send `_rev`. Without it EmDash writes over whatever an editor changed since your read.

## Handle the answers

| Answer | Meaning | What the script does |
| --- | --- | --- |
| `409` with `CONFLICT` | Someone changed the listing since your read | Read it again, apply your change to what is there now, then write once more |
| `409` with `ENTRY_LOCKED` | Someone has it open in the admin | Leave it and try again on the next run. Do not override the lock |
| `503` with `STORAGE_INDEXES_NOT_READY` | Listora was just updated and its storage indexes are still being built. EmDash answers this on Listora's own routes that change data (CSV import, sample data) | Wait a minute and send the same request again. Content API writes are not refused |
| `429` or `503` with `Retry-After` | The site asks you to slow down | Wait the seconds it names, then go on |

## Go slowly

Every publish runs Listora's hook (up to eight calls of its own) and clears cached pages. Send about one listing a second, wait for each answer before the next, and stop on the first error you do not recognise. A first import of thousands of listings is better done with the CSV import page (`/listings/import/`), which sends rows in small steps.

## Check the directory afterwards

After a run, ask Listora's public `listings` route for what you wrote:

```http
GET /_emdash/api/plugins/<plugin>/listings?ids=<id1>,<id2>
```

`<plugin>` is `listora` on a local install and `r_2oeji6rfeg7ovdex` on a registry install. A listing missing from the answer is not in the directory yet: it is not published, past its date, or its hook did not run. Listora's hourly check puts the last kind right by itself; you can also publish the listing again. Add `&category=<slug>` to check one category. Answers are cached for 30 seconds.

# Add a listing

**Included in Free**

The form is at `/listings/submit/`. A visitor who is not signed in sees **Sign in to add a listing**. After sign-in, the form has five steps.

## The five steps

1. **Type.** Pick one type. The extra fields on Details follow that choice. The form offers every type you have not hidden on [Listing types](listing-types.md): the built-ins (Business, Restaurant, Real estate, Hotel, Event, Job, Healthcare, Education, Place, Classified and Software) and your own.
2. **Basics.** **Listing title** is required. **Short summary**, **Description**, **City**, and **Street address** are optional. A type without a place has no city or address fields, and none are stored for it. The summary is what cards show.
3. **Details.** Phone, email, website, and the fields for the type you picked. Event asks for **Starts** and **Ends**.
4. **Categories.** Pick a category if the site has any. You can leave it as **No category**. Country and state are on this step, for a type with a place.
5. **Preview.** Read the card, tick **I confirm this listing is accurate.**, then **Submit for review**.

**All listings** returns to the directory. You can move between steps with the step buttons. Basics will not continue until the title is filled. The form says **Enter a title.**

## The type's own fields

Each field the type has on [Listing types](listing-types.md#fields) gets an input that fits its kind:

| Kind | Input | Checked on the site |
| --- | --- | --- |
| Text | A text box | Up to 200 characters |
| Number | A number box | A number |
| Choice from a list | A drop-down of the field's choices | One of the choices |
| Link | A web address box | Starts with http:// or https://, up to 200 characters |
| Date | A date picker | A real date |
| Yes or no | A checkbox | Yes or no |

A field marked **Required on the listing form** must be filled before the listing can be sent. The site checks every value again when it arrives, so a value the form would not allow is refused with the field's name.

The same fields show on the owner's edit form (Your account, **Edit**). An owner cannot empty a required field there. Changes to a live listing wait for your approval under Listing changes, each named by its field label.

## CSV import and export

Export (site kit page `/listings/import/`, site admins only) adds one column per field label across your types; types that share a label share the column. Import reads those columns back for each row's own type, checks them by kind, and refuses a row whose value does not fit. Required fields are not enforced on import, since imported rows wait as drafts. A field label that matches a standard column (Title, City and the rest) is refused on Listing types, so every field has its own column. A row of a type without a place keeps no city or address.

## What happens next

With **Approve listings before they show** on, the listing waits in the Listings queue. The visitor sees that it is in review. You approve it under Admin, Listora, Listings queue. It then appears on `/listings/`.

With that setting off, the listing goes live when it is submitted.

A listing whose title and city match one already in the directory shows a warning with a link to that listing. The visitor can still send it.

Blocked words, set under Settings, Listings, refuse the listing. The form says why.

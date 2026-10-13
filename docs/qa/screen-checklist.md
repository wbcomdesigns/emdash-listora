# Screen checklist

**Included in Free**

Walk these in a real browser on `http://localhost:4321`. 1440 and 390. Light and dark. Visitor, then owner, then admin.

Do not add Pro controls while you walk. If you see Compare, Needs, Credits, verification, or a lead-form extra, that is a fail.

## Archive `/listings/`

- [ ] Page title and count
- [ ] Add a listing is the one primary
- [ ] Search has an `sr-only` or visible Search label
- [ ] Location field and Near me
- [ ] Search submit
- [ ] Type chips, All plus 10 Free types
- [ ] Featured row only when there is no search or type filter
- [ ] Sort: Featured, Rating, Title
- [ ] Grid and list
- [ ] Card: photo, type, place, rating when present, owner when present, amenity chips, Save
- [ ] Empty: icon, title, body, Add a listing
- [ ] OSM map when listings have lat/lng
- [ ] Search "fork" keeps Golden Fork
- [ ] Type Restaurant narrows the grid
- [ ] Nonsense query shows the empty primitive
- [ ] No horizontal scroll at 390
- [ ] No Compare or quick view on the card

## Detail `/listings/{slug}/`

- [ ] Breadcrumb: Listings / title
- [ ] Full-width cover (photo or type Unsplash), not a solid type-color slab
- [ ] Header: title, type, place, rating
- [ ] Actions: Save, Share, Directions. No Compare
- [ ] Tabs: Details, Reviews, Contact
- [ ] Hours table with Open/Closed when hours exist
- [ ] Sidebar map and claim
- [ ] Review form: stars, title, body, field errors, `aria-busy`
- [ ] Contact form: name, email, message, honeypot, field errors
- [ ] Claim form: name, email, proof, field errors
- [ ] JSON-LD in the page
- [ ] Expired listing shows the expired notice and stays off the archive

## Submit `/listings/submit/`

- [ ] Steps named Type, Basics, Details, Categories, Preview
- [ ] Active step is `aria-current="step"`
- [ ] Type is radio cards, not a lone select
- [ ] Hidden steps do not show extra Submit buttons
- [ ] Title required: error on the field, focus moves there
- [ ] Duplicate warning if the title clashes
- [ ] Two-column rows collapse at 1024
- [ ] Preview looks like a card
- [ ] Terms check before submit
- [ ] Success status, then a next action
- [ ] No Pro upsell on any step

## Calendar `/listings/calendar/`

- [ ] Event listings appear
- [ ] Link back to the listing
- [ ] 390 is readable

## Account `/account/`

- [ ] Counts for listings, reviews, claims, favorites
- [ ] Tabs or sections: Overview, listings, reviews, claims, favorites, profile
- [ ] No Credits tab
- [ ] Renew is a kit form, not a credits purchase
- [ ] Privacy export / erase is a kit form

## Admin

- [ ] Get started lists collection, listing count, and sample state
- [ ] Load sample asks for confirm
- [ ] Load sample without a collection shows an error toast
- [ ] Queue empty primitive when nothing is pending
- [ ] Approve a submission. It appears on `/listings/`
- [ ] Reject stays out of the public grid
- [ ] Reviews queue loads
- [ ] Claims queue loads
- [ ] Settings: moderation, default type, spam keywords
- [ ] One primary action per page

## After a change

Update this list, [code-completion.md](code-completion.md), and `docs/website/how-to/directory-screens.md` in the same PR.

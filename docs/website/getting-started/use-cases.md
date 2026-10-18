# Use cases

**Included in Free**

Four ways to run a directory with Listora. Each one says which listing types to use, which settings to change, and what visitors see. Set up the plugin first with [Set up Listora on your site](install.md).

Listora has 10 listing types: Business, Restaurant, Real estate, Hotel, Event, Job, Healthcare, Education, Place and Classified. Every listing has one type. The type decides which fields the add form asks for.

## A partner or consultant directory

Use this to list agencies, freelancers, trainers or other partners.

**Pick**
- Listing types: Business for agencies and consultants. Education for trainers and schools.
- Settings: leave **Approve listings before they show** on. Set **Default listing type** to Business under Listora, Settings, Submissions.
- Fill the directory by CSV import. Open `/listings/import/` as a site admin and upload your spreadsheet. A sample file is at `/vendor/listora-sample.csv`.

**What you do**
1. Import the file. Listora checks it first and lists any bad rows with the reason.
2. Open Admin, Listora, Listings queue, and approve the imported drafts. An import never publishes anything.

**What visitors see**
- `/listings/` with search, a row of type chips, and a card for each partner.
- A page for each partner with tabs, a contact form and a map.
- Only approved listings. Drafts stay hidden.

An import adds up to 100 rows at a time. Export gives you your published listings as a CSV file.

## A local business guide

Use this for a town guide to shops, cafes and services.

**Pick**
- Listing types: Business, Restaurant, Healthcare, Place.
- Settings: keep moderation on if the public can submit. Turn it off only if you add every listing yourself.

**What visitors see**
- Search by keyword and location.
- Chips to filter by type, **Grid** and **List**, and a sort of **Featured**, **Rating**, or **Title**.
- **Open** or **Closed** next to the name when hours are set, and **Open now** or **Closed now** on the hours list. Both follow the site's time zone.
- A map on the directory and on each listing (OpenStreetMap).
- A **Featured** row. It shows the first three featured listings.

Visitors who sign in can save listings and leave reviews. You approve reviews under Admin, Listora, Listing reviews.

## An events or venues list

Use this for a what's on page or a list of venues.

**Pick**
- Listing types: Event for dated things. Place for venues.
- Fill the **Starts** and **Ends** fields on each event. Times use your site's time zone.

**What visitors see**
- `/listings/calendar/` lists upcoming events, soonest first. Past events drop off.
- An empty calendar says "No upcoming events" and links to the add form.
- Each event has its own page. The date is included in the page data search engines read.

Add `/listings/calendar/` to your menu. See [Posts and pages](posts-and-pages.md).

## A member directory where members submit and claim listings

Use this when your members add themselves, or take over a listing you made.

**Pick**
- Listing types: whichever fit your members. Business is the default.
- Turn on member sign-up in EmDash. Without it only your own staff can add listings and reviews.
- Keep **Approve listings before they show** on so you approve each new listing.

**What members do**
1. Sign in and open `/listings/submit/`. The form has five steps: type, basics, type fields, categories, preview.
2. Wait for approval. Spam keywords and a hidden field block most bots.
3. Find a listing you made for them, open it, and use **Claim**. The claim goes to you for review.
4. Follow their listings, reviews, claims and saved places at `/account/`.

**What you do**
- Approve listings under Admin, Listora, Listings queue.
- Decide claims under Admin, Listora, Claims.
- Moderate reviews under Admin, Listora, Listing reviews.

A listing marked as claimed shows a Claimed badge instead of the Claim button.

## Related

- [Posts and pages](posts-and-pages.md)
- [Settings](../settings/plugin-settings.md)
- [Add a listing](../features/submit.md)
- [Reviews and claims](../features/reviews-claims.md)

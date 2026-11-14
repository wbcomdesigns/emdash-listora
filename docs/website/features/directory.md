# Browse the directory

**Included in Free**

Visitors open `/listings/`. They search, filter, and open a listing.

## Search and filters

The search box takes a name or a word. It uses EmDash's own site search, so the listings collection needs **Search** turned on (Content Types, Listings), with Title, Excerpt and Description marked searchable. The collection the install guide creates has this. Keyword results come best match first, so the sort list hides while a search is on. Without Search on the collection, Listora looks for the words in each listing's name, summary and city instead. The location box takes part of a city or neighborhood. **Search** applies both.

Type chips sit under the search: **All**, then every type you have not hidden on **Listing types**. If there is only one type, the chips stay hidden.

Once a type is picked, the type's chip field (if it has one) adds a second row of chips. For Software that is **What it is**: Plugin, Skill, Agent, MCP server, App, Library and Theme. Choosing one shows only that kind, and it stays chosen while a search runs on the same type. You pick a type's chip field on **Listing types** (see [Fields](listing-types.md#fields)).

A type without a place (Software, or your own type with **Listings have a place** off) has no location box, no city chips and no map once it is picked.

Category chips show your listing categories that have listings, with EmDash's count of listings in each (counts show while no type is picked). City chips show the cities of the listings on the page. Choosing one keeps the type filter and narrows the list.

Sort is **Featured**, **Rating**, or **Title**. Once a type is picked, its fields that fill a sort slot (for Software: Stars or installs, Last release, Released) are offered too, highest or newest first. **List** switches the cards to a list. **Grid** switches back.

The directory reads one page at a time from Listora's directory index, so filters, sorts and paging work the same on a directory of any size. **Next** and **Previous** move between pages.

A listing filed under several categories is found under each of them. When you change a published listing's categories in the admin, EmDash saves them at once without telling plugins, so the directory follows within about an hour plus one pass over the listings (about 1 hour 20 minutes at 500 listings, 4 hours 40 minutes at 6,000). Publish the listing to show the change at once. After an update to 0.8.0, listings that existed before reach the category, city and chip filters and the sorts as Listora catches up in the background, a hundred listings at a time: within hours, with no admin visit.

## Cards and the featured row

Each card shows a photo or a type icon, the type, the name, the city (for a type with a place), and a **Featured** badge when the listing is featured. The type's fields marked **Show on directory cards** follow, with their labels. Software cards have their own look: see [Software](listing-types.md#the-card).

The featured row is headed **Featured** and shows the first three featured listings. It hides while a search or a filter is on, so the results are not mixed with it.

A count above the cards says how many listings match. While a keyword or place search is on, it says **Matching listings**, since the total is not counted then.

## One listing

Open a card to see the photo, the type, the name, the city, and the summary. **Save**, **Share**, **Directions**, and **Claim** sit under the name when they apply.

**Details**, **Reviews**, and **Contact** are tabs. Details holds the description, hours, and a **Details** list of every filled-in field of the listing's type (a yes or no field reads Yes or No, a link opens in a new tab, a date follows the site's date format). When the listing has no description but has details, the empty description card is left out. When hours are set, a badge next to the name says **Open** or **Closed**. The hours list says **Open now** or **Closed now**. Both follow the site's time zone. Reviews holds the stars and the notes. Contact is the message form.

A map sits on the directory and on the listing. Tiles come from OpenStreetMap. A listing whose type has no place shows no map, address, hours, directions, or Open and Closed.

### Who manages the listing

Next to the name, a badge says who looks after the listing:

- **Managed by its author**: a member added the listing and manages it.
- **Claimed listing**: an owner claimed it and you approved the claim.

A listing that is not claimed shows no badge. A listing marked claimed with no member behind it (set in the editor, or a claimed sample listing) shows **Claimed listing**, and so does every claimed listing while the site runs an engine older than 0.8.0.

## The calendar

The **Calendar** button sits next to Grid and List while no type, or Event, is picked. The calendar lists Event listings only, so the button hides once another type is picked.

`/listings/calendar/` lists upcoming events, soonest first. Each row shows the date, the name, and the city. **Directory** returns to `/listings/`. An empty calendar says **No upcoming events**.

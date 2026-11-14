# Browse the directory

**Included in Free**

Visitors open `/listings/`. They search, filter, and open a listing.

## Search and filters

The search box takes a name or a word. It uses EmDash's own site search, so the listings collection needs **Search** turned on (Content Types, Listings), with Title, Excerpt and Description marked searchable. The collection the install guide creates has this. Keyword results come best match first, so the sort list hides while a search is on. Without Search on the collection, Listora looks for the words in each listing's name, summary and city instead. The location box takes part of a city or neighborhood. **Search** applies both.

Type chips sit under the search: **All**, then every type you have not hidden on **Listing types**. If there is only one type, the chips stay hidden.

Category chips show your listing categories that have listings, with EmDash's count of listings in each (counts show while no type is picked). City chips show the cities of the listings on the page. Choosing one keeps the type filter and narrows the list.

Sort is **Featured**, **Rating**, or **Title**. Once a type is picked, its fields that fill a sort slot (for Software: Stars or installs, Last release, Released) are offered too, highest or newest first. **List** switches the cards to a list. **Grid** switches back.

The directory reads one page at a time from Listora's directory index, so filters, sorts and paging work the same on a directory of any size. **Next** and **Previous** move between pages.

A listing filed under several categories is found under its first one. After an update to 0.8.0, listings that existed before reach the category and city chips as the hourly check reaches them.

## Cards and the featured row

Each card shows a photo or a type icon, the type, the name, the city, and a **Featured** badge when the listing is featured.

The featured row is headed **Featured** and shows the first three featured listings. It hides while a search or a filter is on, so the results are not mixed with it.

A count above the cards says how many listings match. While a keyword or place search is on, it says **Matching listings**, since the total is not counted then.

## One listing

Open a card to see the photo, the type, the name, the city, and the summary. **Save**, **Share**, **Directions**, and **Claim** sit under the name when they apply.

**Details**, **Reviews**, and **Contact** are tabs. Details holds the description and hours. When hours are set, a badge next to the name says **Open** or **Closed**. The hours list says **Open now** or **Closed now**. Both follow the site's time zone. Reviews holds the stars and the notes. Contact is the message form.

A map sits on the directory and on the listing. Tiles come from OpenStreetMap.

## The calendar

`/listings/calendar/` lists upcoming events, soonest first. Each row shows the date, the name, and the city. **Directory** returns to `/listings/`. An empty calendar says **No upcoming events**.

# Changelog

Versions match `package.json`, the git tag, and the EmDash registry release. Newest first. Never publish a version that is not on `origin/main`.

## [0.4.0] - 2026-10-13

Bigger directories, a Messages screen, and a kit that suits existing sites. Copy `site-kit/` again after you update, including the new `site-kit/public/vendor/` folder.

- New      - Paging. The archive shows 24 listings per page with Previous and Next, and the directory is no longer cut off at 80 listings.
- New      - Messages admin page. Read what visitors sent from a listing, mark it handled or delete it.
- New      - The map library ships inside the kit, so a site that only allows its own scripts needs no change.
- Improve  - Ratings are kept in the plugin's own storage. Approving a review never touches or republishes the listing.
- Improve  - A rating updates at once when a member rewrites or erases their review.
- Improve  - The account and submit pages tell the site never to cache them, because they differ per visitor.
- Improve  - Public listing reads are cached for 30 seconds, so a busy page does not repeat the same work.
- Fix      - The submit form was missing the Bathrooms field for real estate listings.
- Fix      - A contact message is only accepted for a public listing, and is capped at 1000 characters.
- Dev      - New public route `ratings`. `listings` and `search` take `page` and `per_page` and return `total`, `page`, `pages`.
- Dev      - Tests fail if the listing-type lists in the plugin, the kit, the manifest and the submit page drift apart.

## [0.3.1] - 2026-10-13

Safety follow-up to 0.3.0. No kit changes: you do not need to copy `site-kit/` again.

- Fix      - Approving a review or a claim no longer publishes unfinished edits that were sitting on the listing. The rating waits and catches up once the listing is published.
- Fix      - A bad record can no longer stop the Listora admin pages from loading.
- Security - Members can only review, save or claim a public listing.
- Security - The member dashboard only shows a listing's name when the listing is public or the member submitted it.

## [0.3.0] - 2026-10-13

Members sign in, the core flows finish, and the directory works in dark mode. Copy `site-kit/` again after you update: the pages and the CSS changed.

- New      - Members act as their signed-in account. Adding a listing, reviewing, saving, claiming and the dashboard need a sign-in. Guests browse and can message a listing.
- New      - `review` route for members. One review per member per listing. Writing again replaces it and sends it back for approval.
- New      - Registry listing has a name, icon, banner, screenshots, long description, install steps and FAQ.
- Improve  - Approving or rejecting a review recalculates the listing rating.
- Improve  - Approving a claim marks the listing as claimed and makes the claimant its owner.
- Improve  - Reviews and Claims tables show the listing name, the star count and the full text being approved.
- Improve  - The member dashboard shows listing names, links and plain status wording, and its tabs scroll in one row on a phone.
- Improve  - A rating catches up after a member rewrites or erases an approved review.
- Improve  - Spam keywords can be edited in Settings.
- Improve  - The submit limit is eight per hour per member instead of a permanent block.
- Improve  - Listing schema uses the listing type's own schema.org type.
- Improve  - Calendar lists upcoming events only, soonest first.
- Fix      - Submitting with Require moderation off publishes the listing instead of leaving it as an unlisted draft.
- Fix      - Reviews and Claims admin pages failed to load once they had a row to show.
- Fix      - The directory was unreadable in dark mode. Kit colours now follow the site theme.
- Fix      - Search icons overlapped the placeholder text.
- Fix      - A missing listing returns a real 404.
- Security - Import, export and the claims list need an admin. A member id sent in a request is ignored.
- Security - Kit pages escape review, listing and dashboard text before showing it.
- Security - A review or claim rewritten after the admin loaded the page cannot be approved without a second look.
- Dev      - `reviews` is read only. `favorites`, `dashboard`, `privacy`, `renew`, `claims` and `submit` are member routes. `import` is admin only.
- Dev      - `docs/qa/QA_CHECKLIST.md` lists the release cases by role. `scripts/lab-role.sh` switches the lab account to a subscriber.
- Dev      - One `api`, `esc` and `notify` helper in `site-kit/lib/listora.ts`. Typecheck runs inside `npm test`.

## [0.2.1] - 2026-10-13

Site-kit chrome. Copy `site-kit/` again after install. Plugin routes stay the same.

- Improve - Type chips and detail tabs stay one row and scroll sideways on a phone.
- Improve - Featured listings use a horizontal track instead of a stacked card grid.
- Improve - Detail cover fills the content width. Title sits beside the sidebar on desktop.
- Improve - Detail sidebar uses owner, contact, hours, map, and claimed cards.
- Improve - Calendar event times use America/New_York. Date-only events stay on that calendar day.

## [0.2.0] - 2026-10-13

First-run Get started plus drop-in site-kit pages so testers see a finished directory.

- New - Get started admin page with Load sample directory (12 NYC listings, reviews, a claim).
- New - Drop-in archive, detail, submit, calendar, and account pages in `site-kit/pages/`.
- New - QA catalog at `docs/qa/` for owner readiness and the screen walk.
- Improve - Directory command bar, location, Near me, sort, card rating, owner, and amenity chips.
- Improve - Health no longer writes demo rows on an empty site.
- Improve - Count copy uses singular for one listing or result.

## [0.1.0] - 2026-10-13

First registry release as `@vapvarun.bsky.social/listora`.

- Sandboxed engine: listings, search, submit, reviews, claims, favorites, dashboard, contact, import, privacy, renew
- Block Kit admin: queue, reviews, claims
- Site kit: `--listora-*` tokens, 33 NYC seed listings, archive / detail / submit / calendar / account screens in the local lab
- Publisher: `did:plc:2o6axbe264shvyedyhycyhya`

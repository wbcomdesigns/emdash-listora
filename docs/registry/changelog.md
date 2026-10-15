## 0.6.1

- Security: map popups show listing titles as plain text; emails are stored as plain addresses only. Copy the kit again after updating.
- Fix: renewing and editing follow the listing's current owner.

## 0.6.0

- Security: website links must be a full http or https address; server-side calls run inside EmDash with no web request.
- Improve: settings in tabs, Find and Load more on every admin list, all visitor wording in one file. Copy the kit again after updating.

## 0.5.2

- Fix: the directory offers a type filter only for types its listings use, and hides it when there is just one. Copy the kit again after updating.

## 0.5.1

- Fix: the directory pages now reach Listora on a site that installed it from the registry. Adding a listing, reviews, saving, messages and the account page failed there before. Copy the kit again after updating.
- Improve: banner no longer cut off on a phone.

## 0.5.0

New permissions: sending email, reading and assigning categories, adding files to the media library.

- New: owners edit their listing, add photos, read visitors' messages, reply to reviews and renew, all from their account. Edits, photos and replies wait for approval.
- New: listing expiry with a reminder email, and an hourly notice when messages wait.
- New: browse by category and city. Listing pages show the details of their type.
- New: import and export as a spreadsheet, a Settings page, and a dashboard card.
- New: one setup command adds the directory pages, and an optional Listings block for post text.
- Improve: site time zone, live search, admin lists with Load more.
- Security: member ids never shown, stricter checks on every member action.

Run `scripts/add-to-site.sh` again after updating.

Older versions: https://github.com/wbcomdesigns/emdash-listora/blob/main/CHANGELOG.md

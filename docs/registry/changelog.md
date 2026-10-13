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

## 0.4.1

- New: Delete my data on the account page.
- Improve: dark mode buttons and star ratings meet contrast. Tabs work with arrow keys.
- Fix: a failed request shows a message, never a blank area.
- Fix: rating structured data uses the listing's own type.

## 0.4.0

- New: paging on the directory, 24 listings per page.
- New: Messages admin page for what visitors send from a listing.
- New: the map library ships inside the kit. No outside scripts.
- Improve: ratings live in the plugin's own storage and update at once.
- Fix: Bathrooms field restored on the submit form.

Copy `site-kit/` again after updating, including `site-kit/public/vendor/`.

Older versions: https://github.com/wbcomdesigns/emdash-listora/blob/main/CHANGELOG.md

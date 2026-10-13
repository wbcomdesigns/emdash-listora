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

## 0.3.1

- Fix: approving a review or claim no longer publishes unfinished edits on the listing.
- Fix: a bad record cannot stop the Listora admin pages from loading.
- Security: members can only review, save or claim a public listing.

## 0.3.0

- New: members act as their signed-in account. Guests browse and can message a listing.
- New: one review per member per listing, approved before it shows.
- Improve: review approval updates the listing rating. Claim approval marks the listing claimed and sets its owner.
- Improve: moderation tables show the listing name and the full text being approved.
- Fix: submitting with moderation off publishes the listing.
- Fix: Reviews and Claims admin pages load when they have rows.
- Fix: dark mode follows the site theme. Search icons no longer overlap the placeholder.
- Security: import, export and the claims list need an admin.

Full history: https://github.com/wbcomdesigns/emdash-listora/blob/main/CHANGELOG.md

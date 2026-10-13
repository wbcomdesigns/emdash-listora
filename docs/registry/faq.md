**Why is `/listings/` a 404 after install?**
An EmDash plugin cannot create pages. Run the setup command from Installation to add them to your site, then reload.

**Can guests add listings or reviews?**
No. Guests browse and can message a listing. Adding a listing, reviewing, saving and claiming need a signed-in account, which keeps spam down and gives every listing an owner.

**Do new listings go live straight away?**
Only if you turn off approval in Settings. With it on, which is the default, a listing waits in the queue until you approve it. Owner edits, photos and replies to reviews always wait for you.

**Does it work in dark mode?**
Yes. The kit colours follow your site theme.

**Does it send email?**
Two short notices to listing owners, if your site has email set up: messages are waiting, and your listing expires in seven days. Neither carries visitor text, and each can be turned off in Settings. Without email, owners still see everything in their account.

**Is there a paid version?**
No. Everything here is free.

**Can I show listings inside a blog post?**
Yes, with one extra step. The kit includes a Listings block for post and page text that you switch on in `astro.config.mjs`. The install guide has the lines to add.

**Can I move listings in from a spreadsheet?**
Yes. A site admin can import a CSV file at `/listings/import/`. Rows are checked first and arrive as drafts.

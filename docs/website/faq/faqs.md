# FAQ

**Included in Free**

## Does installing the plugin add the directory pages?

No. The plugin adds the admin screens and the directory engine. The pages (`/listings/`, the add form, the calendar, and `/account/`) come from the site kit. [Set up Listora on your site](../getting-started/install.md) copies them in.

## Where do I approve a listing?

Admin, Listora, Listings queue. Open **Review** on a row and choose **Approve and publish** to put it on the directory. **Reject** keeps it off. Get started shows the same queue once the directory already has listings.

## Why is the directory empty?

New listings wait for approval when **Approve listings before they show** is on. Approve them in the Listings queue. Drafts and rejected listings stay hidden.

## Can visitors add a listing without an account?

No. The add form asks them to sign in. Turn on member sign-up in EmDash if you want people other than your staff to add listings and reviews.

## Where do I change the words on the directory?

In `src/lib/listora-strings.ts`, the file the setup command copies. [Reword the directory](../customize/wording.md) shows the example of renaming Listings to Find a partner. Running the setup command again replaces that file, so keep a copy of your wording.

## Where is import and export?

On the site, at `/listings/import/`, for a site admin. Settings, Import and export links to it. An import adds drafts. Nothing goes live until you approve it in the Listings queue.

## Can I use the WordPress plugin on EmDash?

No. EmDash does not run PHP. This is the EmDash plugin. WordPress Listora stays its own product.

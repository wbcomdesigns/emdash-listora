# Settings

**Included in Free**

Open Admin, Listora, Settings. Each group is a tab with one Save.

| Tab | What it does | Default |
| --- | --- | --- |
| Listings | **Approve listings before they show**, **Default listing type**, and **Blocked words, separated by commas** | Approval on, type Business, words `viagra, crypto pump` |
| Lifetime | **Days before a listing expires** (0 means never) and **Email the owner 7 days before**. Listora keeps each listing's expiry date itself (0.7.0). If your listings type has no `listing_status` field, a note says an expired listing still shows on pages that read the listings directly | 0, reminder on |
| Photos | **Photos an owner may add (0 means none)** | 5 |
| Email | **Email the owner when a message arrives** | On |

Each tab saves on its own. Choose **Save** on that tab. Under the tabs, **Open import and export** links to the site page `/listings/import/`.

**Refresh categories now** reads every listing's categories again in the background, a few dozen listings a minute. Use it after changing many listings' categories in EmDash's sidebar: such a change otherwise reaches the directory within a few hours by itself, or at once when the listing is published. The line under the button says when the refresh started and when it finished. Pressing it again while it runs starts nothing.

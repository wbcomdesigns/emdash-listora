# Plugin settings

**Included in Free**

Settings are a page of their own: `/_emdash/admin/plugins/listora/settings`. Each group is a tab with one Save.

| Tab | What it does | Default |
| --- | --- | --- |
| Submissions | Approve listings before they show, the type already selected on the form, and blocked words | Approval on, type Business, words `viagra, crypto pump` |
| Listing lifetime | Days before a listing expires (0 means never), and a reminder 7 days before | 0, reminder on |
| Photos | How many photos an owner may add. 0 turns owner photos off | 5 |
| Messages | Email the owner when a message arrives | On |
| Import and export | A link to `/listings/import/` on the site. Nothing on this tab is saved |  |

A later settings page should split submit, search, maps, reviews, and spam the way WordPress Listora does. Until then, do not add settings only in code. Declare them in `emdash-plugin.jsonc` `admin.settingsSchema` so the host encrypts secrets and the consent dialog stays honest.

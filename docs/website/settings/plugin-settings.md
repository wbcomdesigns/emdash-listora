# Plugin settings

**Included in Free**

Settings live on the Listora queue page in EmDash admin. There is not a separate settings IA yet.

| Setting | What it does | Default |
| --- | --- | --- |
| Require moderation | Keep public submissions as drafts until someone approves them | On |
| Default listing type | Type pre-selected on submit | Business |
| Spam keywords | Comma-separated words that reject a public submit | `viagra, crypto pump` |

Open: `/_emdash/admin/plugins/listora/queue`

A later settings page should split submit, search, maps, reviews, and spam the way WordPress Listora does. Until then, do not add settings only in code. Declare them in `emdash-plugin.jsonc` `admin.settingsSchema` so the host encrypts secrets and the consent dialog stays honest.

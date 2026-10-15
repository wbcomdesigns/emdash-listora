# When something looks wrong

**Included in Free**

## The directory address is not found

The plugin does not add `/listings/` by itself. Run the setup command in [Set up Listora on your site](../getting-started/install.md), then open `/listings/` again.

## The directory has no listings

Open Admin, Listora, Listings queue. If rows are waiting, open **Review** and choose **Approve and publish**. With **Approve listings before they show** on, a new listing stays hidden until you do.

Get started offers **Load sample directory** only while the directory is not set up yet. That button adds the sample listings. It is safe to run more than once.

## Owner photos stay off

Open Settings, Photos. If a notice says photos need a Photos field, run the setup command again. It adds the field. Then set **Photos an owner may add** above 0 and choose **Save**.

## A menu item opens a missing page

Add only the addresses you use: `/listings/`, `/listings/submit/`, `/listings/calendar/`, and `/account/`. A site that does not have another plugin will not have that plugin's pages.

## The wording change did not show

Edit `src/lib/listora-strings.ts` and rebuild the site. If you ran the setup command after editing it, that command replaced the file. Put your copy back and rebuild.

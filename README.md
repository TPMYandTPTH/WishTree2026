# TP Wish Tree 2026

One TP. Many Wishes. One Christmas Together.
A shared Christmas wish tree for TP Malaysia and Thailand, hosted on GitHub Pages with Supabase behind it.

## Links

| Page | Link | Who it's for |
|---|---|---|
| The tree | https://tpmyandtpth.github.io/WishTree2026/ | Everyone |
| One site's tree | `…/WishTree2026/?site=op` (ids: gtower, kcp, gbs, op, lv, jb, singha, wfh) | Site posters, intranet |
| Lobby screen tour | `…/WishTree2026/?tour=1` | TVs at the sites |
| Flat tree | `…/WishTree2026/?view=flat` | Older devices; the 3D tree switches to this by itself when WebGL isn't available |
| Hang a wish | `…/WishTree2026/wish.html` (add `?site=op` to pre-pick the site) | Employees |
| Leaders' messages | `…/WishTree2026/leaders/` | Leaders on the leaders list only |

Until the Supabase keys are in `config.js`, every page runs in demo mode with sample wishes and nothing is saved.

## Going live (all in the browser)

1. **Database:** create a Supabase project, open **SQL Editor**, paste all of `schema.sql`, click **Run**.
2. **Leaders and moderators:** in **Table Editor**, add rows to `leaders` (email, name, title) and `moderators` (email). Emails in lower case. Only people in `leaders` can post on the leaders' page; the database blocks everyone else.
3. **Google sign-in:** **Authentication > Sign In / Providers > Google**, turn it on and paste the Client ID and Secret from a Google Cloud OAuth client (Web application). In Google Cloud, add the callback URL Supabase shows you as an authorised redirect URI.
4. **Allowed links:** **Authentication > URL Configuration**. Site URL: `https://tpmyandtpth.github.io/WishTree2026/`. Redirect URLs: add `https://tpmyandtpth.github.io/WishTree2026/**`.
5. **Keys:** **Project Settings > API**, copy the Project URL and the anon / publishable key into `config.js`, then commit and push with GitHub Desktop.
6. **Approving wishes:** until the moderation page is built, open **Table Editor > wishes** and change `status` from `pending` to `approved`.

## Notes

- The tree is 3D (`tree3d.js`, built with three.js, kept in `vendor/` so it doesn't depend on an outside CDN). People can drag it to turn it; it turns a full circle when a site is picked.

- Each person can post up to 3 wishes (change `max_wishes_per_person` in `app_settings`). Set `submissions_open` to false to close the campaign.
- Wishes with a phone number or email address are flagged automatically for the moderators.
- To add a site: add it to `SITES` in `config.js` and add its id to `wishes_site_check` in `schema.sql`, then run that part again.
- Logo: `assets/tp-logo-white.png` (from the ELP repo). TP Sans is used when installed on the device; otherwise the pages fall back to Noto Sans. Only add the TP Sans font files to `fonts/` if TP allows them in a public repo.

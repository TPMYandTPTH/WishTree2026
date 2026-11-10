# TP Wish Tree 2026

One TP. Many Wishes. One Christmas Together.
A shared Christmas wish tree for TP Malaysia and Thailand, hosted on GitHub Pages with Supabase behind it.

## Links

| Page | Link | Who it's for |
|---|---|---|
| The tree | https://tpmyandtpth.github.io/WishTree2026/ | Everyone (anyone can like a message, once per device) |
| One site's tree | `…/WishTree2026/?site=op` (ids: gtower, kcp, gbs, op, lv, jb, singha, wfh) | Site posters, intranet |
| Tree in some languages | `…/WishTree2026/?lang=en,ms` (codes from `LANGUAGES` in `config.js`) | Sharing a link for one language group |
| Site tour | `…/WishTree2026/?tour=1` | Laptops at events |
| Flat tree | `…/WishTree2026/?view=flat` | Older devices; the 3D tree switches to this by itself when WebGL isn't available |
| **TV screen** | `…/WishTree2026/tv/?site=op` (leave out `?site=` for all sites, add `&lang=en,ms` for some languages only) | The TV at each site |
| Hang a wish | `…/WishTree2026/wish.html` (add `?site=op` to pre-pick the site) | Employees |
| Leaders' messages | `…/WishTree2026/leaders/` | Leaders on the `leaders` list only |
| **Approvals** | `…/WishTree2026/approve/` | The Wish Tree team on the `moderators` list only |

Until the Supabase keys are in `config.js`, every page runs in demo mode with sample wishes and nothing is saved outside your browser.

## How a message gets on the tree

1. An employee hangs a wish (150 characters max) or a leader writes a message (250 max).
2. It waits on the **Approvals** page. Nothing shows on the tree or the TVs until someone approves it.
3. Approvers can Approve, Edit and approve, or Don't approve. Wishes with a phone number or email are flagged in orange. "Approve all without flags" clears the clean ones in one go (click twice to confirm).
4. Approved messages appear on the tree and the TVs within a minute. New ones jump the TV queue with a "Just hung" label.
5. If a leader edits an approved message, it goes back to waiting. The **Leaders' messages need approval** switch on the Approvals page turns this off if leaders should post straight to the tree.

The **Accept new wishes** switch on the Approvals page closes or reopens the campaign.

## How many cards fit, languages and the list

- **The 3D tree holds 60 wishes** (`MAX_TAGS_3D`), plus up to 6 leaders at the top. That's the most it can hang without tags overlapping. The flat tree holds 40.
- When a site (or "All sites") has more approved wishes than that, **the most-liked go on the tree** (ties go to the newest). Every wish, on the tree or not, is in the **Every wish** list under the tree, with search, Most liked / Newest, and a like button. The TVs still show every wish in turn.
- **Languages:** people pick the language they wrote in (Thai, Chinese, Japanese, Korean, Tamil and Vietnamese are picked automatically as they type). Readers choose one or more languages with the **Languages** button on the tree; the choice is remembered on their device. Leaders' messages always show. Edit `LANGUAGES` in `config.js` to add or remove languages; the database accepts any 2-3 letter code.
- **Likes:** one per device, no sign-in. Leaders' messages can be liked but their count isn't shown on the tree or the TVs (the Approvals page still sees it).
- **Leaders' places:** set `spot` for each leader in Table Editor > leaders. `ceo` = the big ornament with a double gold ring right under the star, and a card styled like a signed letter (shown first on the tree and the TVs). `crown` = the top of the tree (room for 5 besides the CEO). `gift` = inside one of the two gift boxes on the right under the tree (they open on hover or tap; on the TVs they open when that message plays). `sort_order` sets the order. If the top is full, the next leaders go into the gifts, then the list only. Section 10 of `schema.sql` has the 8 leaders ready to paste once you have their emails.
- **Hidden wishes:** the two gifts on the left under the tree open when the mouse rests on them (or a tap on phones): the big red one holds Amr's wish, the tall gold one credits Maszy for the idea. Edit the words in `HIDDEN_WISHES` in `config.js`, or delete an entry to make that gift a normal one. Only the tree turns; the gifts stay still.
- **Leader photos:** leaders add a photo on the leaders' page. It's cropped to a circle, shrunk and stored in the `leader-photos` bucket in Supabase Storage (created by `schema.sql`). It shows on their gold ornament, their card, the list and the TVs. A new photo goes back for approval like an edited message.

## TV screens

- Open `tv/?site=<id>` on the TV's browser and press **F** (or the Full screen button that shows when you move the mouse). For a kiosk PC, start Chrome with `--kiosk` and the link.
- Shows one message at a time (12 seconds, `TV_SECONDS` in `config.js`), with a leaders' message after every 4 wishes (`TV_LEADER_EVERY`). The 3D tree turns to face each message.
- Works on landscape and portrait screens of any size. Add `&view=flat` for slow TV browsers, `&seconds=15` to change the timing on one screen, `&snow=0` to turn off the snowfall.
- Refreshes the data every minute, keeps the screen awake where the browser allows it, and reloads itself every 6 hours to pick up updates.
- Keyboard while setting up: Right / Left arrows to move, Space to pause.

## Going live (all in the browser)

1. **Database:** create a Supabase project, open **SQL Editor**, paste all of `schema.sql`, click **Run**. It's safe to run again after updates; existing wishes are kept.
2. **Leaders and approvers:** in **Table Editor**, add rows to `leaders` (email, name, title) and `moderators` (email). Emails in lower case. Only `leaders` can post on the leaders' page and only `moderators` can open the Approvals page; the database blocks everyone else.
3. **Google sign-in:** **Authentication > Sign In / Providers > Google**, turn it on and paste the Client ID and Secret from a Google Cloud OAuth client (Web application). In Google Cloud, add the callback URL Supabase shows you as an authorised redirect URI.
4. **Allowed links:** **Authentication > URL Configuration**. Site URL: `https://tpmyandtpth.github.io/WishTree2026/`. Redirect URLs: add `https://tpmyandtpth.github.io/WishTree2026/**`.
5. **Keys:** **Project Settings > API**, copy the Project URL and the anon / publishable key into `config.js`, then commit and push with GitHub Desktop.

## Notes

- Character limits live in two places: `MAX_LENGTH` / `LEADER_MAX_LENGTH` in `config.js` and the two `char_length` checks in `schema.sql`. Keep them the same.
- Likes need no sign-in: one like per message per browser, stored with a random device id. Counts show on the tree, the TVs and the Approvals page.
- The tree is 3D (`tree3d.js`, built with three.js, kept in `vendor/` so it doesn't depend on an outside CDN). People can drag it to turn it; it turns a full circle when a site is picked.
- Tree look: `TREE_STYLE` in `config.js`. `light` (a tree made of light, the current choice), `cone` (one smooth cone) or `tiers` (smooth layers). Add `?style=cone` to any tree or TV link to preview another look.
- Each person can post up to 3 wishes (change `max_wishes_per_person` in `app_settings`).
- To add a site: add it to `SITES` in `config.js` and add its id to `wishes_site_check` in `schema.sql`, then run that part again.
- Logo: `assets/tp-logo-white.png` (from the ELP repo). TP Sans is used when installed on the device; otherwise the pages fall back to Noto Sans. Only add the TP Sans font files to `fonts/` if TP allows them in a public repo.

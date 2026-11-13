# TP Wish Tree 2026

One TP. Many Wishes. One Christmas Together.
A shared Christmas wish tree for TP Malaysia and Thailand, hosted on GitHub Pages with Supabase behind it.

## Links

| Page | Link | Who it's for |
|---|---|---|
| The tree | https://tpmyandtpth.github.io/WishTree2026/ | Everyone (liking asks for a BMS once) |
| One site's tree | `…/WishTree2026/?site=op` (ids: gtower, kcp, gbs, op, lv, jb, singha, wfh) | Site posters, intranet |
| Tree in some languages | `…/WishTree2026/?lang=en,ms` (codes from `LANGUAGES` in `config.js`) | Sharing a link for one language group |
| Site tour | `…/WishTree2026/?tour=1` | Laptops at events |
| Flat tree | `…/WishTree2026/?view=flat` | Older devices; the 3D tree switches to this by itself when WebGL isn't available |
| **TV screen** | `…/WishTree2026/tv/?site=op` (leave out `?site=` for all sites, add `&lang=en,ms` for some languages only) | The TV at each site |
| Hang a wish | `…/WishTree2026/wish.html` (add `?site=op` to pre-pick the site) | Employees: first name or nickname + BMS, no sign-in |
| Leaders' messages | `…/WishTree2026/leaders/` | Leaders, with the leaders' password (they type their name, with suggestions, once) |
| **Approvals** | `…/WishTree2026/approve/` | The Wish Tree team, with the Approvals password |
| **Gift exchange** | `…/WishTree2026/gift/host.html` (players join through the QR it makes) | Any team running a Secret Santa. Live on its own keys in `gift/gift-config.js`; details in `gift/README.md` |

Until the Supabase keys are in `config.js`, every page runs in demo mode with sample wishes and nothing is saved outside your browser.

## How a message gets on the tree

1. An employee hangs a wish (150 characters max) with their first name or a nickname and their BMS number. No sign-in, no phone number. The BMS isn't checked: any BMS can hang a wish (it still needs approval), but a wish whose BMS looks made up can't win the prize (see below). **One wish per BMS:** sending again from the same phone or browser edits the first one (it goes back to waiting); any other device that types the same BMS is refused. A leader writes a message (250 max) on the leaders' page.
2. It waits on the **Approvals** page. Nothing shows on the tree or the TVs until someone approves it.
3. Approvers can Approve, Edit and approve, or Don't approve. Wishes with a phone number or email are flagged in orange. "Approve all without flags" clears the clean ones in one go (click twice to confirm).
4. Approved messages appear on the tree and the TVs within a minute. New ones jump the TV queue with a "Just hung" label.
5. **Approval is always on, for security:** every wish and every leader message waits on the Approvals page, and any edit (words, name, title, photo) sends it back to waiting. The database enforces this; there's no switch to turn it off. The leaders' page needs the leaders' password and the Approvals page needs the Approvals password (see **Passwords** below).

The **Accept new wishes** switch on the Approvals page closes or reopens the campaign.

## How many cards fit, languages and the list

- **The 3D tree holds 60 wishes** (`MAX_TAGS_3D`), plus up to 8 leaders at the top. That's the most it can hang without tags overlapping. The flat tree holds 40.
- When a site (or "All sites") has more approved wishes than that, **the most-liked go on the tree** (ties go to the newest). Every wish, on the tree or not, is in the **Every wish** list under the tree, with search, Most liked / Newest, and a like button. The TVs still show every wish in turn.
- **Languages:** people pick the language they wrote in (Thai, Chinese, Japanese, Korean, Tamil and Vietnamese are picked automatically as they type). Readers choose one or more languages with the **Languages** button on the tree; the choice is remembered on their device. The button only offers languages that have at least one approved wish on that site (no Thai wishes = no Thai), and hides itself when there's only one. Leaders' messages always show. Edit `LANGUAGES` in `config.js` to add or remove languages; the database accepts any 2-3 letter code.
- **Likes:** the first like asks for the BMS; the device remembers it ("Liking as BMS … · Change" under the tree). Leaders' messages get a brass **Thank you** button instead (it turns to "Thanked"), with no count, so it's never mixed up with the prize likes.
- **Likes that don't count, silently:** every like shows straight away (heart filled, count +1), but the database only stores it when the BMS looks real (4 to 7 digits, not one digit repeated like 55555, not a straight run like 1234567 or 7654321), it's not the person's own wish, this device hasn't already liked that message (one like per device, whatever BMS is typed), and it's before the deadline. A like that wasn't stored is gone when the page is reloaded. Nobody is told, so there's nothing to work around.
- **Reading:** with a mouse, resting on a tag, an ornament or a gift opens its card (the tree doesn't turn); a click or tap also opens it and turns the tree to face it.
- **Leaders' places:** set in `LEADERS` in `config.js` (31 leaders), one line each, in the order they show. `spot: 'ceo'` = the big ornament with a double gold ring right under the star, and a card styled like a signed letter (shown first on the tree and the TVs). `spot: 'crown'` = around the top of the tree, in a mixed order that stays the same each visit (room for 7 besides the CEO): now Divya Dutta, Himanshu, Alex Ma, Sarah and Rachel. `spot: 'list'` = the list under the tree only. `level` sets the card in the **Every wish** list: `'exec'` (C-level and VP) = ornament-shaped cards, 5 per row, always shown after the CEO's letter (on phones the row is swiped sideways); `'director'` = medium cards, 5 per row, and `'manager'` (managers and below) = small cards, 6 per row, both behind **See more** and only once they've posted. Only names on the `LEADERS` list with `level: 'director'` get the Director card; anyone else gets the regular (manager) card. Amr's and Maszy's cards (the words in `HIDDEN_WISHES`) come last inside **See more**; people can thank them (and the two hidden gifts) with no count shown, remembered on their device and sent to Tag Manager as `team_thanks`.
- **Launch:** the tree goes out once Andy's message is in. Every other leader appears only after they post and it's approved, In the preview (sample mode, for review) every card type is filled with samples; add `?samples=launch` to a preview link to see launch day with Andy's message only. Every leader with a message plays on the TVs in turn.
- **Leaders' page:** a note at the top tells anyone who isn't a senior leader to hang their own wish, with the link to the wish page. Leaders type their name with suggestions from `LEADERS` (A to Z, with titles); picking one fills in the title and default photo, and the name can't change after the first send. Leaders write in English only: there's no language choice, and the database refuses Thai, Chinese, Japanese, Korean, Tamil and other non-Latin scripts in a leader's message, name or title.
- **Hidden wishes:** the two small gifts on the left under the tree (they don't move) open when the mouse rests on them (or a tap on phones): the Cranberry one holds Amr's wish, the Brass one credits Maszy for the idea. Edit the words in `HIDDEN_WISHES` in `config.js`, or delete an entry to make that gift a normal one. Only the tree turns; the gifts stay still.

## The prize: 5 x RM 100 gift cards

- The big Cranberry gift on the right of the tree hops every few seconds. Opening it shows the prize, the deadline and the rules (no live standings). On the TVs it's its own slide every 9 messages (`TV_PRIZE_EVERY`), and the gift opens on the tree.
- **Deadline:** likes count until **11:59 pm on 25 December 2026, Malaysia time**. The database stops storing likes at `likes_close_at` in **Table Editor > app_settings** (change it there if the date moves, and the `deadline` wording in `PRIZE` in `config.js`).
- **Who can win:** approved employee wishes only. Leaders' messages never count. A wish can't win when its BMS is in **Table Editor > prize_excluded** (add Amr's, Maszy's and the Wish Tree team's BMS there, never in the code: this repo is public) or looks made up (same rule as likes). Ties: the wish that reached that number of likes first ranks higher.
- **Picking the winners:** the Approvals page has **Prize standings** (each wish's BMS, how many connections the likes came from, an orange row when most came from one, and "not eligible" with the reason), **Who liked** (BMS, connection, time), **Download winners** (the top 5 eligible: place, name, BMS, site, likes, wish), **Download full standings**, and **Remove likes** for a BMS whose likes look faked. Wishes with a made-up-looking BMS are also flagged in the approval queue.
- Change the wording, number of winners or amount in `PRIZE` in `config.js`; `enabled: false` hides the prize everywhere.

## Passwords (no emails, no sign-in)

- Nobody signs in with an email or Google. There are two passwords, both checked by the database:
  - **Leaders' password:** opens the leaders' page. Share it only with the leaders (with the link). A leader stays in on that browser for 30 days. Ten wrong tries from one connection lock it for 15 minutes.
  - **Approvals password:** opens the Approvals page. Use a different, longer one and keep it to the Wish Tree team. It stays open on that browser for 12 hours. **Five wrong tries from one connection lock it for 15 minutes**, and 100 wrong tries an hour from anywhere lock that page's password for everyone for a while (anyone already in stays in).
- **Set or change them** in Supabase **SQL Editor**, one line each (at least 10 characters; pick your own, never put them in the code or a chat):
  `select public.set_access_password('leader', 'your-leaders-password');`
  `select public.set_access_password('admin', 'your-approvals-password');`
  Then clear the editor. The database keeps only a scrambled copy (bcrypt). Changing a password signs everyone out of that page at once, so do it if a password gets shared too widely.
- **The trade-off:** anyone who has the leaders' password can write as any leader name not taken yet. That's covered by approval: nothing shows until you approve it, and you can see the name, title, photo and message first. **Delete (frees the name)** on the Approvals page removes a wrong one so the real leader can post.
- **One message per name:** the first message from a browser takes the name. That browser keeps a secret key (only a scrambled copy is stored) so the leader can edit or remove it later, from the same browser only. From another device, the name shows as taken; delete the old one on the Approvals page and they post again.

## Security

- **What we store:** for employees, the first name or nickname they type and their BMS, with their wish, site, language and likes. For leaders, the name, title, message and photo they send. No emails, no phone numbers, no IP addresses: each wish and like keeps only a **connection code** (a scrambled, one-way code of the connection, the same for everyone on one office network) so the limits and the prize checks work.
- **What's private:** BMS numbers and connection codes are only readable through the Approvals page, with the Approvals password. The tree and the TVs only ever get first name, site, wish, language, tag and like count, and leaders' name, title, message and photo once approved.
- **No direct database access:** the public can't read or write the tables; wishes and likes only go through checked functions (`submit_wish`, `set_like`). Every input is checked in the database: BMS up to 20 characters (no `<` or `>`), name up to 30 characters, wish up to 150, site and language from the lists. No phone numbers are collected.
- **Editing:** each wish gets a random secret key kept on the phone that sent it (only a fingerprint of it is stored). Without that key, a BMS that already has a wish can't be changed. Every edit goes back to waiting, so nothing changes on the tree without approval. On a shared phone or laptop, "Forget me on this device" clears it.
- **Spam and like-farming:** limits per connection and per BMS (60 new wishes per connection per 10 minutes, 20 edits per BMS per hour, 400 likes per connection and 120 per device per 10 minutes; generous enough for a whole site on one office connection). Logins have their own limits (see **Passwords**).
- **The pages:** no outside scripts (Supabase, three.js and the QR code library are kept in `vendor/`), a Content Security Policy on every page that only allows this site, Supabase, Google Fonts and Google Tag Manager / Analytics (the Approvals page doesn't load Google at all), everything people type is shown as text (never as HTML), and the Approvals and leaders' pages refuse to load inside another site's frame.
- **What's left:** a BMS isn't a password, so someone who knows a colleague's BMS could hang a wish in their name before they do (it still waits for approval) or like with it. If that happens, delete the wish on the Approvals page so the real person can post, and use Remove likes. Checking the prize standings (connections, Who liked) before announcing winners covers the rest.
- If your Supabase project uses a custom domain instead of `*.supabase.co`, add it to the Content Security Policy line at the top of each page.
- **Colours:** Spruce `#343F37`, Pine `#736E52`, Brass `#B18854`, Cranberry `#6C151E`, Eggnog `#CFC3B0`. The pages are Eggnog with Cranberry writing (smaller text in a deeper Cranberry, `#3D0B10`, so it's easy to read); the logo is the black TP logo (`assets/tp-logo-black.png`).
- **Leader names:** the leaders' page offers the names in `LEADERS` in `config.js` as a list. A leader picks theirs once; after the first send it's locked (the database keeps the first name too), and no one else can send under that name.
- **Leader photos:** each name in `LEADERS` has a default photo in `assets/leaders/`, named after the name in lower case with dashes (`alex-ma.jpg`). Andy, Divya Dutta and Sarah are in; the README there lists all 31 file names. Until a file is there, the leader's initials show. Leaders can also change it on the leaders' page (**Change photo**; **Use the default photo** goes back): it's cropped to a circle, shrunk to a small 160 x 160 picture and saved with the message in the database (no Storage bucket), replaces the one in the folder once approved, and goes back for approval like an edited message. Photos show on the gold ornament, the card, the list and the TVs.

## Analytics (Google Tag Manager)

- `GTM_ID` in `config.js` (`GTM-P4TRBDVQ`) loads Tag Manager on the tree, the wish page, the TVs and the leaders' page. Set up GA4 inside Tag Manager (a Google tag with your G- ID, trigger: All Pages).
- GA4 (G-G5Q9FDEKEZ) is set up inside the container. The pages send their events to it through that GA4 tag (`GA4_EVENTS_VIA_GTM` in `config.js`), so they show in GA4 without any Tag Manager change. To report on the details (site, kind, who, place, method, langs), add them in GA4 > Admin > Custom definitions as event-scoped custom dimensions.
- The pages also push these to the dataLayer as **Custom Events**, to use as triggers: `wish_open`, `leader_open`, `prize_open`, `secret_wish_found`, `wish_like`, `wish_unlike`, `leader_thanks`, `leader_unthanks`, `team_thanks`, `team_unthanks`, `leaders_more`, `wish_cta`, `wish_submit`, `wish_edit`, `leader_publish`. They never include a name, BMS or message.
- If you add a tag that loads from another domain, add that domain to the Content Security Policy line at the top of each page.

## TV screens

- Open `tv/?site=<id>` on the TV's browser and press **F** (or the Full screen button that shows when you move the mouse). For a kiosk PC, start Chrome with `--kiosk` and the link.
- Shows one message at a time (12 seconds, `TV_SECONDS` in `config.js`), with a leaders' message after every 4 wishes (`TV_LEADER_EVERY`). The 3D tree turns to face each message.
- Works on landscape and portrait screens of any size. Add `&view=flat` for slow TV browsers, `&seconds=15` to change the timing on one screen, `&snow=0` to turn off the snowfall.
- Refreshes the data every minute, keeps the screen awake where the browser allows it, and reloads itself every 6 hours to pick up updates.
- Keyboard while setting up: Right / Left arrows to move, Space to pause.

## Going live (all in the browser)

1. **Database:** open the Supabase project, **SQL Editor**, paste all of `schema.sql`, click **Run**. It's safe to run again after updates; existing wishes are kept. It only touches the Wish Tree tables (the gift exchange tables are left alone), and removes the old email columns, the IP addresses and the old `leaders`, `moderators` and `bms_allowlist` tables.
2. **Passwords:** in the SQL Editor, run the two `set_access_password` lines (see **Passwords** above) with your own passwords, then clear the editor.
3. **Prize exclusions:** in **Table Editor > prize_excluded**, add Amr's, Maszy's and the Wish Tree team's BMS.
4. **Keys:** **Project Settings > API**, copy the Project URL and the anon / publishable key into `config.js`, then commit and push with GitHub Desktop.

No Google sign-in or email setup is needed. If an older version created a `leader-photos` bucket in **Storage**, you can delete it.

## Notes

- Character limits live in two places: `MAX_LENGTH` / `LEADER_MAX_LENGTH` in `config.js` and the two `char_length` checks in `schema.sql`. Keep them the same.
- Likes need no sign-in, only a BMS once per device. Counts show on the tree, the TVs and the Approvals page.
- The tree is 3D (`tree3d.js`, built with three.js, kept in `vendor/` so it doesn't depend on an outside CDN). People can drag it to turn it; it turns a full circle when a site is picked.
- **Weak connections:** the 3D tree needs about 0.7 MB of files. If they haven't arrived after a few seconds (or the download breaks), the flat tree shows so nobody is left waiting, the page keeps trying in the background (and again when the connection comes back), and the 3D tree takes over once it's in. Devices without WebGL always get the flat tree.
- Tree look: `TREE_STYLE` in `config.js`. `light` (a tree made of light, the current choice), `cone` (one smooth cone) or `tiers` (smooth layers). Add `?style=cone` to any tree or TV link to preview another look.
- One wish per BMS. To let someone start again (lost phone, typo in the BMS), delete their wish on the Approvals page.
- To add a site: add it to `SITES` in `config.js` and add its id to `wishes_site_check` in `schema.sql`, then run that part again.
- Logo: `assets/tp-logo-white.png` (from the ELP repo). TP Sans is used when installed on the device; otherwise the pages fall back to Noto Sans. Only add the TP Sans font files to `fonts/` if TP allows them in a public repo.

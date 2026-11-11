# Gift Exchange (Secret Santa)

A Secret Santa page in the same look as the Wish Tree. People scan a QR, add their name and a few gift hints, and when everyone's in the host draws names. Each person then sees only who they're giving to. Nobody signs in, and nobody, including the host, can see the full list of pairs on any page.

Lives in the `gift/` folder of the WishTree2026 repo.

## Links

| Page | Link | Who it's for |
|---|---|---|
| Host | https://tpmyandtpth.github.io/WishTree2026/gift/host.html | Whoever runs the exchange |
| Join / see your match | `https://tpmyandtpth.github.io/WishTree2026/gift/?g=CODE` (this is what the QR opens) | Everyone playing |

## How it works

1. **Host** opens `host.html`, fills in the exchange name (budget, day and a note are optional) and gets a QR plus a **host key**. Save the host key: it's the only way to manage the exchange from another device. This device remembers it.
2. **Show the QR**: "Show on screen" turns the page into a full-screen QR with a live list of names (good for a meeting room TV). "Download QR" saves a ready-to-print card. "Copy invite" copies a message with the link for the team chat.
3. **Players** scan, type their name and optional gift hints, and get a **secret code** (like `K7QM2-PX4RD`). Their phone remembers it. The code lets them see their match on another phone or browser.
4. **Draw**: when everyone's in, the host taps **Draw names** twice. Joining closes. The draw is one random circle through everyone, so nobody gets themselves and no two people just swap.
5. Players' pages switch by themselves (or on the next visit) to a wrapped gift. Tapping it unwraps the name and their gift hints. The host sees who has opened theirs, never who has who.

**Missed the draw?** The host taps **Undo the draw and reopen joining**, the late person joins, then draw again. Everyone gets a new match, so do this before people start shopping.

**Remove a name** (duplicate, test, someone dropped out): tap **Remove** twice on the host page. Only possible before the draw. Players can also leave themselves before the draw.

**Gift hints** can be changed any time, even after the draw. The person buying for them sees the latest version.

## Setup (already done)

- **Database:** Supabase project **TP Wish Tree** (`yemysibghglelnapsekg`, Singapore, free plan). `gift/gift.sql` has been run there. To set it up somewhere else: Supabase > **SQL Editor** > New query > paste all of `gift/gift.sql` > **Run**. Safe to run again.
- **Keys:** in `gift/gift-config.js` (public publishable key, safe in a public repo). They're kept out of the root `config.js` on purpose, so the Wish Tree pages stay in demo mode until you take those live. When you do, you can use the same Supabase project for the Wish Tree: run `schema.sql` there and copy the same two keys into `config.js`.
- No Google sign-in or email setup is needed for the gift exchange.

**Demo mode:** blank the two lines in `gift/gift-config.js` and both pages save everything in your browser only. Open `host.html` in one tab and the join link in another to try the flow. The host page then has an "Add 5 sample names" button.

**Free plan note:** Supabase pauses a free project after about a week with no activity. If the pages show "Couldn't reach the server" after a quiet spell, open the project in Supabase and click **Restore**.

## Privacy notes

- The two tables (`gift_groups`, `gift_people`) are locked: the public key can't read or change them. The pages only call the database functions in `gift.sql`, and each returns just what that person may see.
- Only a hash of each secret code and host key is stored.
- The pairs are stored in `gift_people.giving_to`. Anyone who opens that table in Supabase Table Editor after the draw could work them out. If you're playing too, don't open it.
- The QR link only lets someone join and see the exchange name, budget, day and how many people joined. Names of who joined are shown only to players who have joined, and to the host.
- To clear old exchanges after the season, run the clean-up line at the end of `gift.sql`.

## Limits

- 3 to 200 people per exchange. Names up to 40 characters (must be unique in the exchange, any case). Hints up to 200 characters.
- Max 60 new exchanges per hour across the whole site (a brake against spam).

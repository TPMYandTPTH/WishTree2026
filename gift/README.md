# Gift Exchange (on the spot)

A quick gift exchange in the Wish Tree look. Everyone brings a unisex gift (RM 30-50). On the day, people scan a QR, type their name and get a simple number (#1, #2, #3 ...). When everyone's in, the organiser taps **Match everyone**: everyone goes into one random circle, so each person gives to one person and gets a gift from someone else. The big screen shows who gives to who, and each phone shows its own match.

## Links

| Page | Link | For |
|---|---|---|
| **Big screen** | https://tpmyandtpth.github.io/WishTree2026/gift/screen.html | The TV or projector |
| **Organiser** | https://tpmyandtpth.github.io/WishTree2026/gift/organiser.html | The organiser's own phone (PIN) |
| Join | https://tpmyandtpth.github.io/WishTree2026/gift/ (the QR on the big screen opens this) | Everyone |

## On the day

1. Open the big screen on the laptop connected to the TV and press **F** for full screen.
2. Open the organiser page on your phone and enter the PIN once. Your phone remembers it.
3. Tap **Start fresh** before people arrive, to clear any test names.
4. People scan the QR. Their names pop onto the screen with their number.
   - No phone? Add their name on the organiser page (or the big screen's organiser bar).
   - Duplicate or wrong entry? Tap the × next to the name, then tap again.
5. On the organiser page, tag people who work closely together (**Rec** or **Src**). Nobody gives to someone with the same tag. Everyone else stays **None**. Tags only show on the organiser page.
6. Tap **Match everyone** (twice to confirm), on your phone or the big screen. The screen shuffles, then shows every match. Phones update by themselves; people tap their gift to see who they give to and who they get from.
7. Someone arrived late? **Undo matches**, add them, match again. Everyone gets a new match.

Odd or even numbers both work: it's one circle, so nobody is left out and nobody simply swaps with the person they give to (with 3 or more people).

If one tag has more than half the people, some same-tag matches can't be avoided. The organiser page warns you before you match and uses the fewest possible.

## Saved tags

Tags you set are saved by name, so they come back automatically if that person joins again (after **Start fresh**, or next year). You can also save tags before the day under **Saved tags**. A saved "Wei Ling" also tags "Wei Ling Tan". Add other spellings separately (for example YJ and Yi Jie).

## Settings

`gift/gift-config.js` holds the title, team, gift rule and budget shown on the pages, plus the database keys (public keys, safe in a public repo). They're separate from the root `config.js`, so the Wish Tree pages stay in demo mode.

Blank the two key lines to try everything in **demo mode** (saved in your browser only, organiser PIN `1234`): open `screen.html`, `organiser.html` and the join page in separate tabs.

## Database

Supabase project **TP Wish Tree** (`yemysibghglelnapsekg`, Singapore, free plan). `gift/gift.sql` is already set up there.

- **Change the organiser PIN:** Supabase > SQL Editor, run `select public.gx_set_pin('your-new-pin');` (4 or more characters). After 10 wrong PINs in 10 minutes the PIN is locked for 10 minutes.
- **Set up somewhere else:** paste all of `gift/gift.sql` in the SQL Editor, run it, then set the PIN as above. Safe to run again.
- **Free plan:** Supabase pauses a free project after about a week with no visits. Open the big screen a day or two before the event. If it says it can't reach the server, open the project in Supabase and click **Restore**.

## Privacy

Nobody signs in. The list of names and the matches are meant to be seen by everyone at the event, so anyone with the link can see them. Tags are never sent to the big screen or the phones; only the organiser page can read them, with the PIN. The tables can't be read or changed directly with the public key: the pages only call the database functions in `gift.sql`, and changing the list (add, remove, tag, match, undo, start fresh) needs the organiser PIN, except that people can add themselves and fix their own name before matching.

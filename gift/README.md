# Gift Exchange (on the spot)

A quick gift exchange in the Wish Tree look. Everyone brings a unisex gift (RM 30-50). On the day, people scan a QR, type their name and get a simple number (#1, #2, #3 ...). When everyone's in, the organiser taps **Match everyone** and the big screen shows who swaps with who. Each phone shows its own match too.

## Links

| Page | Link | For |
|---|---|---|
| **Big screen** | https://tpmyandtpth.github.io/WishTree2026/gift/screen.html | The TV or projector (and the organiser) |
| Join | https://tpmyandtpth.github.io/WishTree2026/gift/ (the QR on the big screen opens this) | Everyone |

## On the day

1. Open the big screen link on the laptop connected to the TV and press **F** for full screen.
2. Click **Organiser** (bottom right) and enter the PIN once. The laptop remembers it.
3. People scan the QR. Their names pop onto the screen with their number.
   - No phone? Type their name in **Add a name**.
   - Duplicate or wrong entry? Tap the name on the screen, then tap again to remove it.
4. Tap **Match everyone** (twice to confirm). The screen shuffles, then shows every match. Phones update by themselves; people tap their gift to see who they swap with.
5. **Odd number of people?** One group of 3 gives in a small circle (#5 gives to #10, #10 to #8, #8 to #5). Everyone else swaps in pairs. Nobody is left out.
6. Someone arrived late? **Undo matches**, add them, match again. Everyone gets a new match.
7. After the event (or to clear a test run): **Start fresh** clears every name and numbers start from #1 again.

**Lock** hides the organiser buttons on that screen.

## Settings

`gift/gift-config.js` holds the title, team, gift rule and budget shown on the pages, plus the database keys (public keys, safe in a public repo). They're separate from the root `config.js`, so the Wish Tree pages stay in demo mode.

Blank the two key lines to try everything in **demo mode** (saved in your browser only, organiser PIN `1234`): open `screen.html` in one tab and the join page in another.

## Database

Supabase project **TP Wish Tree** (`yemysibghglelnapsekg`, Singapore, free plan). `gift/gift.sql` is already set up there.

- **Change the organiser PIN:** Supabase > SQL Editor, run `select public.gx_set_pin('your-new-pin');` (4 or more characters). After 10 wrong PINs in 10 minutes the PIN is locked for 10 minutes.
- **Set up somewhere else:** paste all of `gift/gift.sql` in the SQL Editor, run it, then set the PIN as above. Safe to run again.
- **Free plan:** Supabase pauses a free project after about a week with no visits. Open the big screen a day or two before the event. If it says it can't reach the server, open the project in Supabase and click **Restore**.

## Privacy

Nobody signs in. The list of names and the matches are meant to be seen by everyone at the event, so anyone with the link can see them. The tables can't be read or changed directly with the public key: the pages only call the database functions in `gift.sql`, and changing the list (add, remove, match, undo, start fresh) needs the organiser PIN, except that people can add themselves and fix their own name before matching.

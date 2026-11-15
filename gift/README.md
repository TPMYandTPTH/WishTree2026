# Gift Exchange (on the spot)

A quick gift exchange in the Wish Tree look. Everyone brings a unisex gift (RM 30-50). On the day, people scan a QR and type their name. When everyone's in, the organiser taps **Match everyone**: everyone gets a number, which is their place in the line. People stand in number order, each number gives their gift to the next one, and the last number gives to #1. The big screen shows the whole line and each phone shows its own number, who to give to and who gives to them.

## Links

| Page | Link | For |
|---|---|---|
| **Big screen** | https://tpmyandtpth.github.io/WishTree2026/gift/screen.html | The TV or projector (and the organiser) |
| Join | https://tpmyandtpth.github.io/WishTree2026/gift/ (the QR on the big screen opens this) | Everyone |

## On the day

1. Open the big screen on the laptop connected to the TV and press **F** for full screen.
2. Click **Organiser** (bottom right) and enter the PIN once. The laptop remembers it.
3. Tap **Start fresh** before people arrive, to clear any test names.
4. People scan the QR. Their names pop onto the screen.
   - No phone? Type their name in **Add a name**.
   - Duplicate or wrong entry? Tap the name on the screen, then tap again to remove it.
5. Tap **Match everyone** (twice to confirm). The screen shuffles, then shows the numbered line. Phones update by themselves.
6. Everyone lines up in number order and gives to the next number. The last number gives to #1.
7. Someone arrived late? **Undo matches**, add them, match again. Everyone gets a new number.

**Lock** hides the organiser buttons on that screen.

## Line order

The line is random. An optional private list in the database (`gx_order`, filled in from the Supabase SQL Editor, not stored in this repo) can place certain first names towards the end of the line:

- `bridge`: first of that end group
- `end`: in that end group
- `last`: the very last number (so they give to #1)

Names match on the first word, so "Jane", "jane" and "Jane Tan" all match `jane`. Add other spellings as extra rows. Change the list any time before matching:

```sql
select * from public.gx_order;                                        -- see it
insert into public.gx_order (alias, place) values ('jane', 'end');   -- add a name
delete from public.gx_order where alias = 'jane';                     -- remove a name
```

## Settings

`gift/gift-config.js` holds the title, team, gift rule and budget shown on the pages, plus the database keys (public keys, safe in a public repo). They're separate from the root `config.js`, so the Wish Tree pages stay in demo mode.

Blank the two key lines to try everything in **demo mode** (saved in your browser only, organiser PIN `1234`): open `screen.html` in one tab and the join page in another.

## Database

Supabase project **TP Wish Tree** (`yemysibghglelnapsekg`, Singapore, free plan). `gift/gift.sql` is already set up there.

- **Change the organiser PIN:** Supabase > SQL Editor, run `select public.gx_set_pin('your-new-pin');` (4 or more characters). After 10 wrong PINs in 10 minutes the PIN is locked for 10 minutes.
- **Set up somewhere else:** paste all of `gift/gift.sql` in the SQL Editor, run it, then set the PIN as above. Safe to run again.
- **Free plan:** Supabase pauses a free project after about a week with no visits. Open the big screen a day or two before the event. If it says it can't reach the server, open the project in Supabase and click **Restore**.

## Privacy

Nobody signs in. The list of names and the line are meant to be seen by everyone at the event, so anyone with the link can see them. The tables (including `gx_order`) can't be read or changed with the public key: the pages only call the database functions in `gift.sql`, and changing the list (add, remove, match, undo, start fresh) needs the organiser PIN, except that people can add themselves and fix their own name before matching.

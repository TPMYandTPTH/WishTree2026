# Leader photos

Put one photo per leader in this folder with exactly these names (lower case):

| Leader | File |
|---|---|
| Andy (CEO, under the star) | `andy.jpg` |
| Divya Dutta | `divya-dutta.jpg` |
| Sarah | `sarah.jpg` |
| Rachel | `rachel.jpg` |
| Himanshu | `himanshu.jpg` |
| Vivienne | `vivienne.jpg` |
| Chavis | `chavis.jpg` |
| Sudhar | `sudhar.jpg` |

- Square head-and-shoulders photo, face in the middle, about 400 x 400 px (anything from 300 to 800 is fine). JPG keeps the site fast.
- The tree crops it to a circle, so leave a little space around the head.
- Until a file is here, the leader's initials show instead. Nothing breaks if a photo is missing.
- With Supabase live, the same file names go in `default_photo` in Table Editor > leaders (section 10 of `schema.sql` has them). A leader who uploads their own photo on the leaders' page replaces this one after approval.

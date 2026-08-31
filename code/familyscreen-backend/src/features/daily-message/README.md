# Daily messages: review, approve and delete

Daily messages live in the `daily_messages` table of the existing application
database. Schema, seeds and UI still stay inside this feature folder. Personal
messages and users are not touched.

The texts themselves are German, because that is what the FamilyScreen displays.
Everything around them — this document, the review page and all error messages —
is English.

## One-time setup

Run in the backend directory:

```powershell
npm run db:migrate
npm run db:seed-content
```

The seed imports 260 candidates. New entries always start out as `pending` and
therefore cannot reach the device yet. The seed is idempotent: it can be run
again and skips texts that already exist.

## Writing your own daily message

Besides the seeded candidates, you can add your own texts to the pool. On the
**Review daily messages** page, expand **Write your own daily message**, type the
text and save it.

- The entry is stored as `approved` right away and records the signed-in user as
  its reviewer. There is no second click on **Approve**.
- It gets the category `family`, which keeps it distinguishable from seeded
  entries.
- The same limits apply as for seeds: at most 110 characters, and only characters
  the device font can draw. Both are shown while typing and checked again on the
  server when saving.
- The text has to be unique; a text that already exists is rejected.
- The new entry shows up under the **Approved** filter, not under the default
  **Pending** filter.
- On the device it appears on the next calendar day at the earliest, because
  today is already assigned to another entry. From then on it comes first,
  because entries that were never shown take precedence.

Rejecting and deleting work the same way for your own entries as for seeds.

## Reviewing texts by hand

1. Start the backend and sign in to the web interface.
2. Open **Daily messages** in the sidebar.
3. The **Pending** filter lists every entry that has not been reviewed yet.
4. On each card, check the text, the category, the character count and the linked
   source of inspiration. The technical maximum is 110 characters.
5. Choose **Approve** when the content is linguistically correct, factually sound
   and suitable for the family. Only then does the daily selection consider it.
6. Choose **Reject** when it is unsuitable, unclear or ambiguous. It stays stored
   for traceability but is never displayed.
7. The **Approved**, **Rejected** and **All** filters let you check and correct
   the outcome again at any time.

If the entry currently selected for today is rejected, its display is reset
immediately. On the next home screen request the backend picks another approved
entry.

## Deleting texts permanently

Deletion is deliberately a two-step process, so a misclick cannot destroy good
content:

1. **Reject** the entry first.
2. Open the **Rejected** filter.
3. Choose **Delete** on the entry.
4. Confirm the prompt.

The server accepts a deletion only for entries that were already rejected.
Deleting is permanent. If a text should merely stop being displayed for a while,
**Reject** is enough.

`npm run db:seed-content` is mainly meant for the initial import. If the seed is
run again later, a seed text that was hard-deleted comes back as a pending draft.
To make it disappear from future installations as well, also remove the matching
entry from `seed-data.ts`.

## Daily selection

The first backend request of a Vienna calendar day marks exactly one approved
entry with that date. Further device requests show the same text. Entries that
were never shown come first, then the least recently used ones. A unique database
constraint prevents two different daily messages on the same day.

If the table is unreachable or nothing has been approved yet, only a neutral
status note appears. Unreviewed content is never shown as a substitute.

## Research basis

The short texts were written independently and inspired by these resources; they
are not a copied internet corpus:

- Oberösterreich Tourismus, *Oberösterreichs Mundart*:
  https://medienservice.oberoesterreich.at/oberoesterreich-woerterbuch.html
- Österreichischer Bundesverlag, *Österreich von A bis Z*:
  https://www.oebv.at/oewb-70-jahre
- Österreichische Akademie der Wissenschaften, *Wörterbuch der bairischen
  Mundarten in Österreich*:
  https://www.oeaw.ac.at/de/acdh/forschung/sprachwissenschaft/ressourcen/woerterbuecher/wboe-online-woerterbuch
- ÖIF Sprachportal, *Österreichisches Deutsch*:
  https://sprachportal.at/fileadmin/user_upload/meinsprachportal-at/OEsterreich_Spiegel/Ausgabe_98/Schwerpunkt_Spiegel_98.pdf

# Kunludo calendars

Downloaded on 2026-11-14 at the user's request:

- [Rendsburger TSV 3, 2026/27](https://rendsburg-eckernfoerde.tischtennislive.de/export/Tischtennis/iCal.aspx?Typ=Team&ID=138084)
- [Rendsburger TSV 4, 2026/27](https://rendsburg-eckernfoerde.tischtennislive.de/export/Tischtennis/iCal.aspx?Typ=Team&ID=138085)

Each fixture contains 20 real scheduled games. UIDs, team/opponent names, UTC times
and venues are preserved. Organizer, attendee, contact and description properties
are omitted because they are not needed for import tests.

Tests use these static files without calling TT-Live. The app supports manual
file upload, not live calendar fetching. Calendar end times are planned durations.

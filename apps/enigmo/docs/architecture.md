# Enigmo architecture

Shared infrastructure is documented in [the shared architecture](../../../docs/architecture.md).

## Enigmo

Enigmo is a browser-only puzzle app at `/enigmo/`, registered through the common
app registry with no API, account or database. Its entry page accepts a code;
`/enigmo/?code=YMIR` opens the first puzzle directly for QR-code invitations.
Typed puzzle definitions live in `apps/enigmo/src/domain/puzzles.ts`. Each option
has a fixed authored letter; correct answers contribute a scrambled anagram.
All questions are freely editable, with a persistent bottom letter strip and
underscores for unanswered questions. Only the final submission grades the
answers and solution; there is no time limit or attempt limit. A final message
points to a person who hands over the prize offline.

A feature-local model/update/command flow owns answers, solution and feedback.
The adapter validates browser saves and scopes them by app, code and content
revision. Storage failures retain the current playable state. No server state
or cross-device synchronization is needed. Codes are invitation shortcuts, not
access controls; puzzle solutions are included in the frontend build.

# Enigmo decisions

Shared choices remain in [the shared decisions](../../../docs/decisions.md).

## Enigmo — 2026-11-05

The user requested a new app with only a code-entry form on its start page and a
query parameter for direct QR links. Author puzzles in the repository rather
than an administration UI. Use the existing browser-only registration and typed
TypeScript data, with no account or database. Persist progress locally per
puzzle/revision; `/enigmo/?code=YMIR` opens the first authored puzzle.

Every question offers arbitrary letter labels instead of A/B/C/D. Its selected
letter fills the corresponding slot in a permanently visible bottom strip;
unanswered slots show underscores. All questions stay freely editable. Feedback
is deferred until the final word check, with unlimited attempts and no timer.
The correct letters form an anagram, and the last task is to rearrange them.

The first puzzle takes roughly 10–15 minutes and uses nine accessible questions
about the recipient's nerd interests, Ymir and knitting. The user clarified that
GARNERING is intentional: Magic: The Gathering plus Garn (yarn), for a shared
Magic/knitting evening. No details about the child are included. Solving reveals
a deliberately indirect clue to the recipient's wife as the “Schatzmeister”,
who awards the prize in person. Implementation defaults require correct answers
as well as the final word; whitespace and case do not affect word validation.

The intermediate anagram may contain multiple German or English words and must
be sufficiently distinct from the final answer. The correct option letters spell
ER GING RAN, with GARNERING remaining the final wordplay. The user selected this German phrase to replace GINGER RAN. Puzzle
revision 4 separates the new letter assignments from previous browser saves.

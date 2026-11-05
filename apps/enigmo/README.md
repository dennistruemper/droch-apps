# Enigmo

Open `/enigmo/` and enter `YMIR`, or use `/enigmo/?code=YMIR` directly as the
QR-code target. Codes ignore surrounding whitespace and letter case. No account
is required. The entry page does not list available puzzles.

## Add a puzzle

Add an object to `src/domain/puzzles.ts`. It is a typed, repository-owned list;
there is no editor or database. Use a unique uppercase `code`, a `revision`, title,
introduction, final task, solution, treasure message and questions. Each question
needs a stable unique `id`, a topic, text, options with distinct single uppercase
letters and the correct letter in `answer`. The correct letters, in question
order, must form a scrambled anagram of the solution (ignoring whitespace/case).
The content consistency test checks these invariants.

Letters belong to the authored options; they do not reshuffle on reload. This
keeps the anagram and saved answers stable. Increment `revision` when changing
answers, question IDs, or the final solution, to start a fresh local save.

Answers and the final input are saved in app-prefixed browser storage per code
and revision. No cross-device synchronization. Invalid saves are discarded;
unavailable storage leaves the puzzle playable. Completion is derived from the
answers and solution, never trusted from a saved completion flag.

Codes are invitations, not authentication. This small personal puzzle is entirely
browser-side, so its authored content and solutions can be inspected in the build.
Do not put credentials or other secrets in puzzle definitions.

## First puzzle (spoilers)

Nine questions cover Star Trek, The Hitchhiker's Guide to the Galaxy, immutable
Linux, PC gaming, Pokémon, Magic, 3D printing, Ymir and knitting. The correct
letters are `GINGER RAN`; the final word is `GARNERING`, combining the
Magic evening with yarn/knitting. The final message points to the player's wife
without naming her directly; the prize is handed over in person.

Fact-check references for the technical questions:

- [Fedora: Silverblue's read-only system](https://fedoraproject.org/wiki/Changes/Silverblue_Kinoite_readonly_sysroot)
- [PrusaSlicer: preparing 3D files for printing](https://www.prusa3d.com/p/prusaslicer/)

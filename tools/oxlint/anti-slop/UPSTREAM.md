# Anti-slop upstream

- Source: https://github.com/dmmulroy/anti-slop
- Revision: `13909c9e07590f5a85d93c62712259fe14a883f7`
- Retrieved: 2026-11-15
- License: MIT (see LICENSE). The nested ESLint Stylistic vendor retains its own
  license and provenance under vendor/eslint-stylistic/.
- Copied from src/, excluding upstream *.test.ts files; source is unmodified.

Nine selected generic rules are enabled in .oxlintrc.json; the other nine
and native oxc/no-accumulating-spread are explicitly disabled. See the anti-slop
decision in docs/decisions.md for the selected policy. Effect rules are included in the snapshot but are not registered;
this project does not use Effect. Keep @oxlint/plugins and oxlint pinned to the
same exact version.

To update, fetch a specific upstream revision into a separate directory, compare
its src/ against this recorded revision and local files, and merge reviewed
changes while preserving local customizations. Retain licenses and update this
record. Run pnpm lint, pnpm typecheck, pnpm format:check, and pnpm test afterwards.

# Schlezaz implementation status

Historical implementation and verification records moved from the shared plan;
commands and counts below describe those earlier runs, not checks for this
documentation change. Shared deployment work remains in
[the shared plan](../../../docs/implementation-plan.md).

## Schlezaz port — implemented

- TypeScript/Solid frontend at `/schlezaz/` with German copy and five generator modes.
- Follow the source PLAN.md: repeat pairs, standard random, wrapping fourth choice,
  shuffle cycles and one randomly selected concrete mode per Random-Random draw.
- Pure rules and feature-local model/message/command transitions; explicit browser
  randomness and timers, stable input rows and disposal-safe callbacks.
- Common registry hosting/builds without unused backend storage or account setup.
- Cover sequence rules, stale callbacks, option edits and desktop/mobile browser flows.

Saved/shared generators, usage statistics, sound and export remain optional future
ideas from the source plan; the original app did not implement them.

Verification: `pnpm check` passes type checking, boundary lint, formatting and 153
unit/integration tests. The production image builds and starts through the isolated
Compose migration gate on Colima. Its Schlezaz desktop/mobile browser flow passes.
The full production browser suite passed 28 checks; one Vortoj phone-board check
encountered a socket disconnect and passed when rerun alone. Container logs show
normal startup with no application error. Desktop/mobile Schlezaz views were
inspected, with no browser errors. Hosted preview verification remains to be done.

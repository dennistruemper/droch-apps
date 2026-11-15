# Schlezaz architecture

Shared infrastructure is documented in [the shared architecture](../../../docs/architecture.md).

## Schlezaz

SchleZaZ is a German browser-only random-choice app at `/schlezaz/`, ported from
an existing Lamdera app to TypeScript and Solid 2. Its registry entry participates
in the common landing page, development server and production build. Entries without
`createRoutes` have no backend API or database; database registration includes only
server-backed apps. No deployment or ingress configuration is needed.

The feature-local generator model owns options, mode, sequence memory and request
phases. Pure rules implement XKCD (fourth option, wrapping), standard random,
SchleZaZ (pairs of identical results), unique-value shuffle and Random-Random
(one random concrete mode per draw). The adapter supplies browser crypto randomness
and a random 2–10 second timer. Edits and mode changes reset sequence memory;
controls freeze during a draw. Request IDs reject stale callbacks and disposal
aborts timers. Options stay in the current tab; there is no account or persistence.
Drochsign provides the base styling with an independent retro theme, German copy,
keyboard-accessible controls, live result announcements and reduced-motion support.

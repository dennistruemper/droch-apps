# droch-apps

A greenfield monorepo for hobby apps: independent Solid frontends, one modular
TypeScript backend, and one Docker Compose deployment in Coolify.

The first apps are account-free scrum poker and an account-based, Scrabble-like
word game. The word game supports playing together or taking turns days apart,
without a turn deadline.

## Project documentation

- [Architecture](docs/architecture.md): stack, boundaries, deployment, and development.
- [Decisions](docs/decisions.md): agreed choices and their rationale.
- [Implementation plan](docs/implementation-plan.md): milestones and verification.
- [Agent instructions](AGENTS.md): rules for contributors and AI agents.

## Status

Planning documentation only. No application scaffold, dependencies, tool pins,
or runnable commands exist yet. Commands mentioned in the plan are intended
interfaces, not currently available scripts.

## Priorities

Type safety, fast feedback, simplicity, and visible side effects, inspired by Elm.
Use TypeScript throughout application code, ordinary functions, and small modules.
TypeScript does not enforce purity; architecture and checks must make effects clear.

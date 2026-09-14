# Active Context

Last updated: 2026-09-14
Current branch: main
Current phase: Onboarding (FeatherSpec setup complete)

## Now
Repository just adopted FeatherSpec. No spec/plan in progress yet.

## Active Spec
- Spec: none yet
- Plan: none yet
- Current task: none
- Acceptance criteria in focus: none

## Changed Recently
- Ran `/sdd-setup` (existing-software path) + deep `/sdd-architecture-scan`: 4
  units mapped (2 deep with `.architecture/` maps, 2 shallow), self-test 10/10.
  Snapshot in `AGENTS.md` reconciled for the first time.
- Confirmed root `app.js`, `server.js`, `style.css`, `emoji-input.js`,
  `socket.io/socket.io.js`, `favicon.ico.backup`, root `emojis/` are dead v1
  code — not deleted yet, left for a future decision.
- Added ESLint (flat config) + Vitest as the quality gate; 9 pre-existing lint
  errors in `src/` left unfixed by user choice (see `techContext.md`).
- Flagged `ngrok.yml` (tracked, plaintext authtoken, not gitignored) as a
  security concern — not yet acted on.

## Decisions in Flight
- Whether/when to delete confirmed-dead legacy v1 files.
- Whether to rotate/remove the `ngrok.yml` authtoken.

## Blockers / Questions
- None currently blocking.

## Next
1. Decide on legacy dead-code removal and the `ngrok.yml` secret.
2. Run `/sdd-specify` for the first real piece of work.

## Validation
- Done: ESLint + Vitest wired and passing on new config (`npx eslint .` passes
  except the 9 known pre-existing errors; `npm test` passes 1/1 smoke test).
- Pending: no real test coverage of app logic yet.
- Known issues: 9 pre-existing lint errors/3 warnings in `src/` (see
  `techContext.md` Quality gates); `ngrok.yml` committed secret.

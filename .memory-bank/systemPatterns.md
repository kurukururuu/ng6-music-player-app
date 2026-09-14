# System Patterns

## Architectural style

See the `architecture:` snapshot in `AGENTS.md` — the only home of structure facts. This file
holds the *why*: decisions and patterns.

## Key decisions
- 2026-09-14 — Adopted FeatherSpec SDD; ran the first deep architecture scan
  (4 units, 2 deep with `.architecture/` maps, 2 shallow; self-test 10/10).
  Confirmed root `app.js`/`server.js`/`style.css`/`emoji-input.js`/
  `socket.io/socket.io.js`/`favicon.ico.backup`/root `emojis/` as dead v1 code,
  unreferenced by any live entry point. — provenance: human (sdd-setup)
- 2026-09-14 — Added ESLint (flat config, classic `rules-of-hooks` +
  `exhaustive-deps` only, not the newer React-Compiler rule set) and Vitest as
  the quality-gate tooling; none existed before. Pre-existing lint errors in
  `src/` left unfixed by user choice (see `techContext.md` Quality gates).
  — provenance: human (sdd-setup)

## Patterns
- TBD

## Knowledge records

*Observation* = what the code does, with a path to check it. *Reason* = why it was built that
way. `decided` = a trusted source says so, and the source is named. `unknown` = nobody wrote it
down; a normal, permanent state, not a defect. `candidates` = explanations found somewhere that
prove nothing. `conflict` = two trusted sources disagree, and neither was chosen.

### The client defers importing `socket.io-client` into a `useEffect`

```yaml
fs-knowledge:
  id: arch-socket-lazy-import-001
  evidence: [src/context/AppContext.jsx]
  rationale:
    state: unknown
    candidates:
      - {statement: "So the SSR bundle stays clean.", source: "src/context/AppContext.jsx (comment at the socket-setup useEffect)"}
```

### Chat history is capped at 200 messages (`slice(-199)` before appending)

```yaml
fs-knowledge:
  id: arch-chat-cap-001
  evidence: [src/context/AppContext.jsx]
  rationale:
    state: unknown
```

### Listener playback applies a fixed default audio-delay offset (200ms), adjustable only via a hard-recalibration event

```yaml
fs-knowledge:
  id: arch-audio-delay-001
  evidence: [src/components/KaraokeRoom.jsx]
  rationale:
    state: unknown
```

### `search-song` swallows API errors and returns a hardcoded fake result instead of emitting an error

```yaml
fs-knowledge:
  id: arch-search-fallback-001
  evidence: [server/server.js]
  rationale:
    state: unknown
```

### Room ids are compared verbatim against an upper-cased `nanoid(6)` (a lowercase submission silently fails to join)

```yaml
fs-knowledge:
  id: arch-room-id-case-001
  evidence: [server/server.js]
  rationale:
    state: unknown
    deferred: {at: "2026-09-14"}
```

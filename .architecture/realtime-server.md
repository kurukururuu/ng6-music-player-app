# last reconciled: 2026-09-14

# Realtime server (`server/server.js`)

## Internal pattern
- Single file, single flat `io.on('connection', socket => { socket.on(EVENT, ...) })`
  block — no router/module split, no classes.
- All state in one in-memory `rooms` object keyed by `roomId` (upper-cased
  `nanoid(6)`): `{ users, playlist, adminId, currentSong, currentVideoId,
  timestamp, isPlaying, totalDuration }`.
- Per-connection state is only `socket.data.roomId`; every handler re-looks-up
  `rooms[socket.data.roomId]`.
- Bottom of file branches on `NODE_ENV === 'production'`: Vite SSR middleware
  (dev) vs prebuilt `dist/server/entry-server.js` + `dist/client` static (prod).

## Entry points
- `server/server.js` itself — run via `package.json` `dev`/`preview` scripts.
  Dynamically loads `src/entry-server.jsx` (dev) / `dist/server/entry-server.js`
  (prod) for SSR.

## Task playbook
- **Add/change a socket event:** add the `socket.on(...)` handler in the single
  connection block in `server/server.js`, mutate `rooms[roomId]`, then emit the
  matching broadcast — mirror the event name in `src/context/AppContext.jsx`.
- **Add persisted state:** none exists — `rooms` is memory-only; a restart drops
  everything. Adding persistence is a new architectural decision, not a small change.

## Deviations
- `search-song` swallows all errors and returns a hardcoded fake result instead of
  emitting `error` — inconsistent with `join-session`'s explicit error emit.

## Traps
- No persistence: process restart drops every room/session/playlist.
- Room ids are compared verbatim (`rooms[roomId]`) against an upper-cased
  `nanoid(6)` — a lowercase id from a client silently misses.
- Admin failover on disconnect is automatic and unconditional (`users[0]`), no
  confirmation step.
- Root `server.js` (legacy, dead) is a near-duplicate with non-uppercased ids and
  no SSR handling — do not assume the two are interchangeable if it's ever run.

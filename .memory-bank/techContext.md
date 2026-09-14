# Tech Context

## Stack
- Client: React 18 + Vite 5 (SSR), Tailwind CSS, `socket.io-client`.
- Server: Node.js (`>=18`), Express 4, `socket.io`, `nanoid`, `youtube-search-api`.
- Package manager: npm (`package-lock.json`).

## Build / Run
- `npm run dev` — runs `server/server.js` directly (dev mode, Vite SSR middleware).
- `npm run build` — `build:client` (`vite build --outDir dist/client`) then
  `build:server` (`vite build --ssr src/entry-server.jsx --outDir dist/server`).
- `npm run preview` — runs `server/server.js` with `NODE_ENV=production` against
  the prebuilt `dist/`.

## Test
- `npm test` → `vitest run`. Only a placeholder smoke test exists so far
  (`src/smoke.test.js`) — no real test coverage of app logic yet.

## Quality gates
Confirmed Definition-of-Green commands, run after every completed
implementation step (added during `/sdd-setup`; none existed before):

1. `npx eslint .`
2. `npm test` (`vitest run`)

Baseline at setup time: `npx eslint .` reports **9 pre-existing errors / 3
warnings** in `src/` (unused vars, empty catch blocks in `AppContext.jsx`,
`KaraokeRoom.jsx`, `UserList.jsx`, `entry-server.jsx`, `useWebRTC.js`) —
knowingly left as-is per user decision; not required to reach zero before new
work, but any file touched by a future step should get its own errors cleared.
Root legacy files (`app.js`, `server.js`, `emoji-input.js`, `test.js`) are
excluded from lint scope — confirmed dead code (see `architecture:` snapshot).

## Constraints
- No database — all realtime state lives in-memory in `server/server.js`; a
  server restart drops every room, session and playlist.
- No REST API — client/server contract is Socket.IO events only.

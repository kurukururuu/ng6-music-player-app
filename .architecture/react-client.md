# last reconciled: 2026-09-14

# React client (`src/`)

## Internal pattern
- `context/AppContext.jsx` — single `useReducer` store; **all** socket wiring
  (connect, every `socket.on(...)`, every emit action creator) lives here behind
  `useApp()`. No other store/context exists.
- `components/*.jsx` — presentational only; local UI state (`useState`/`useRef`)
  for things like drag, volume, search input. Never touch the socket directly —
  always go through `useApp()`.
- `hooks/use*.js` — one hook per browser API (`useWebRTC.js` → `RTCPeerConnection`,
  `useYouTubePlayer.js` → YouTube IFrame API), imperative control surface only.
- `KaraokeRoom.jsx` is the in-room composition root: wires the two hooks together,
  owns all playback-sync `useEffect`s.

## Entry points
- `src/entry-client.jsx` (hydration) / `src/entry-server.jsx` (SSR render), both
  driven from `src/App.jsx` (`AppProvider` + `SessionSetup`/`KaraokeRoom` switch).

## Task playbook
- **Add a socket event (client side):** `context/AppContext.jsx` (add `socket.on`
  listener + reducer case, or new emit action) → consuming component via
  `useApp()`. Never add socket code inside a component.
- **Add a playback-sync behavior:** `components/KaraokeRoom.jsx` (owns the
  `useEffect`s coordinating `useYouTubePlayer` + `useWebRTC` + socket events).

## Deviations
- `colorFor()`/`PALETTE` duplicated verbatim in `UserList.jsx` and `Chat.jsx` — no
  shared `utils/` module under `src/`.

## Traps
- Socket `useEffect` in `AppContext.jsx` has `[]` deps but reaches `state` through
  refs (`removeSessionRef`, `pendingRejoinRef`) to dodge stale closures — read
  `state` directly there and you reintroduce stale-state bugs.
- `KaraokeRoom.jsx`'s socket-listener `useEffect`s deliberately depend only on
  `socketRef.current` (rest lint-disabled) — required to resubscribe after the
  lazy socket connects, not an oversight.
- `Chat.jsx` comment references a nonexistent `emoji.js` — likely a dead reference
  to the removed legacy client (see legacy remnants).

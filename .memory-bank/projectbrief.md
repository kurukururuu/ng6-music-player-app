# Project Brief

## Mission
ngorok-v2 — a real-time web karaoke app (React + Vite SSR client, Express +
Socket.IO server): create/join a room, queue and play YouTube songs in sync,
chat, and talk over WebRTC while singing.

## Primary users
The public, but effectively an "IYKYK" (in-group) audience — small groups of
friends running their own karaoke sessions, not a general public product.

## Success criteria
- A room's participants stay in sync on playback (video + audio delay
  compensation) without manual intervention.
- Sessions survive normal use (chat, playlist changes, admin handoff) without
  desync or crashes; state is in-memory only, so a server restart resetting all
  rooms is accepted, not a bug to fix.

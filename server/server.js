import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import YouTubeSearch from 'youtube-search-api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

// ---------------------------------------------------------------------------
// In-memory room state
// ---------------------------------------------------------------------------
const rooms = {};

function getUsername(room, socketId) {
  return room.users.find((u) => u.id === socketId)?.username ?? 'Unknown';
}

// ---------------------------------------------------------------------------
// Socket.io handlers
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  // --- Create session ---
  socket.on('create-session', ({ username }) => {
    const roomId = nanoid(6).toUpperCase();
    socket.join(roomId);
    const user = { id: socket.id, username, isAdminFlag: true, ping: null };
    rooms[roomId] = {
      users: [user],
      playlist: [],
      adminId: socket.id,
      currentSong: null,
      currentVideoId: null,
      timestamp: 0,
      isPlaying: false,
      totalDuration: 0,
    };
    socket.data.roomId = roomId;
    io.to(socket.id).emit('session-created', {
      roomId,
      isAdmin: true,
      users: rooms[roomId].users,
      assignedUsername: username,
    });
  });

  // --- Join session ---
  socket.on('join-session', ({ username, roomId }) => {
    const room = rooms[roomId];
    if (!room) {
      io.to(socket.id).emit('error', 'Room not found.');
      return;
    }
    socket.join(roomId);
    const user = { id: socket.id, username, isAdminFlag: false, ping: null };
    room.users.push(user);
    socket.data.roomId = roomId;
    io.to(socket.id).emit('session-joined', {
      roomId,
      isAdmin: false,
      users: room.users,
      playlist: room.playlist,
      currentSong: room.currentSong,
      currentVideoId: room.currentVideoId,
      timestamp: room.timestamp,
      isPlaying: room.isPlaying,
      totalDuration: room.totalDuration,
      assignedUsername: username,
    });
    io.to(roomId).emit('update-user-list', room.users);
    io.to(roomId).emit('chat-message', {
      type: 'system',
      message: `${username} joined the room`,
      timestamp: Date.now(),
    });
  });

  // --- YouTube search ---
  socket.on('search-song', async (query) => {
    try {
      const results = await YouTubeSearch.GetListByKeyword(query, false, 5);
      const formatted = results.items
        .filter((item) => item.type === 'video')
        .map((item) => ({
          id: item.id,
          title: item.title,
          thumbnail: item.thumbnail?.thumbnails?.[0]?.url ?? null,
        }));
      io.to(socket.id).emit('search-results', formatted);
    } catch {
      io.to(socket.id).emit('search-results', [
        {
          id: 'dQw4w9WgXcQ',
          title: `Sample: ${query}`,
          thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg',
        },
      ]);
    }
  });

  // --- Playlist management ---
  socket.on('add-song', ({ songData }) => {
    const room = rooms[socket.data.roomId];
    if (!room) return;
    room.playlist.push({ ...songData, addedBy: getUsername(room, socket.id) });
    io.to(socket.data.roomId).emit('update-playlist', room.playlist);
  });

  socket.on('remove-song', ({ index }) => {
    const room = rooms[socket.data.roomId];
    if (!room || room.playlist[index] == null) return;
    room.playlist.splice(index, 1);
    io.to(socket.data.roomId).emit('update-playlist', room.playlist);
  });

  socket.on('move-song', ({ from, to }) => {
    const room = rooms[socket.data.roomId];
    if (!room) return;
    if (from < 0 || to < 0 || from >= room.playlist.length || to >= room.playlist.length) return;
    const [moved] = room.playlist.splice(from, 1);
    room.playlist.splice(to, 0, moved);
    io.to(socket.data.roomId).emit('update-playlist', room.playlist);
  });

  socket.on('play-now', ({ index }) => {
    const room = rooms[socket.data.roomId];
    if (!room || index < 0 || index >= room.playlist.length) return;
    const [song] = room.playlist.splice(index, 1); // remove from queue
    room.currentSong = song;
    room.currentVideoId = song.id;
    room.timestamp = 0;
    room.isPlaying = true;
    io.to(socket.data.roomId).emit('update-playlist', room.playlist);
    io.to(socket.data.roomId).emit('current-song-update', song);
    io.to(socket.data.roomId).emit('PLAY', {
      videoId: song.id,
      currentTime: 0,
      totalDuration: song.duration ?? 0,
      adminActionTimestamp: Date.now(),
    });
  });

  // --- Chat ---
  socket.on('chat-message', ({ username, message, timestamp }) => {
    const room = rooms[socket.data.roomId];
    if (!room) return;
    const msg = message?.trim();
    if (!msg || msg.length > 200) return;
    io.to(socket.data.roomId).emit('chat-message', {
      username: username ?? getUsername(room, socket.id),
      message: msg,
      timestamp: timestamp ?? Date.now(),
      type: 'user',
    });
  });

  // --- Playback events ---
  socket.on('PLAY', (data) => {
    const room = rooms[socket.data.roomId];
    if (!room) return;
    room.currentVideoId = data.videoId;
    room.timestamp = data.currentTime;
    room.isPlaying = true;
    room.totalDuration = data.totalDuration;
    socket.to(socket.data.roomId).emit('PLAY', data);
  });

  socket.on('PAUSE', (data) => {
    const room = rooms[socket.data.roomId];
    if (!room) return;
    room.timestamp = data.currentTime;
    room.isPlaying = false;
    room.totalDuration = data.totalDuration;
    socket.to(socket.data.roomId).emit('PAUSE', data);
  });

  socket.on('SYNC_TIME', (data) => {
    socket.to(socket.data.roomId).emit('SYNC_TIME', data);
  });

  socket.on('next-song', () => {
    const room = rooms[socket.data.roomId];
    if (!room) return;
    // currentSong is separate from playlist — just advance the queue
    if (room.playlist.length > 0) {
      const song = room.playlist.shift();
      room.currentSong = song;
      room.currentVideoId = song.id;
      room.timestamp = 0;
      room.isPlaying = true;
      io.to(socket.data.roomId).emit('update-playlist', room.playlist);
      io.to(socket.data.roomId).emit('current-song-update', song);
      io.to(socket.data.roomId).emit('PLAY', {
        videoId: song.id,
        currentTime: 0,
        totalDuration: song.duration ?? 0,
        adminActionTimestamp: Date.now(),
      });
    } else {
      room.currentSong = null;
      room.currentVideoId = null;
      room.isPlaying = false;
      io.to(socket.data.roomId).emit('current-song-update', null);
    }
  });

  // --- WebRTC signaling ---
  socket.on('webrtc-offer', ({ target, offer }) => {
    io.to(target).emit('webrtc-offer', { from: socket.id, offer });
  });
  socket.on('webrtc-answer', ({ target, answer }) => {
    io.to(target).emit('webrtc-answer', { from: socket.id, answer });
  });
  socket.on('webrtc-ice-candidate', ({ target, candidate }) => {
    io.to(target).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  // --- Ping ---
  socket.on('ping-from-client', (data) => {
    io.to(socket.id).emit('pong-to-client', data);
  });
  socket.on('report-my-ping', ({ ping }) => {
    const room = rooms[socket.data.roomId];
    if (!room) return;
    const user = room.users.find((u) => u.id === socket.id);
    if (user) user.ping = ping;
    io.to(socket.data.roomId).emit('update-user-list', room.users);
  });

  // --- Admin management ---
  socket.on('assign-admin', ({ newAdminUserId }) => {
    const room = rooms[socket.data.roomId];
    if (!room) return;
    room.users.forEach((u) => (u.isAdminFlag = u.id === newAdminUserId));
    room.adminId = newAdminUserId;
    io.to(socket.data.roomId).emit('update-user-list', room.users);
    io.to(newAdminUserId).emit('you-are-now-admin');
  });

  // --- Sync signals ---
  socket.on('admin-periodic-sync', (data) => {
    socket.to(socket.data.roomId).emit('continuous-sync-signal', data);
  });

  socket.on('initiate-hard-recalibration', (data) => {
    socket.to(socket.data.roomId).emit('listeners-pause-for-recalibration');
    setTimeout(() => {
      socket.to(socket.data.roomId).emit('listeners-execute-recalibration', data);
    }, 1000);
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    const idx = room.users.findIndex((u) => u.id === socket.id);
    if (idx === -1) return;
    const [user] = room.users.splice(idx, 1);
    io.to(roomId).emit('user-left-webrtc-cleanup', { socketId: socket.id });
    io.to(roomId).emit('update-user-list', room.users);
    io.to(roomId).emit('chat-message', {
      type: 'system',
      message: `${user.username} left the room`,
      timestamp: Date.now(),
    });
    // Transfer admin if needed
    if (user.isAdminFlag && room.users.length > 0) {
      room.users[0].isAdminFlag = true;
      room.adminId = room.users[0].id;
      io.to(room.users[0].id).emit('you-are-now-admin');
      io.to(roomId).emit('update-user-list', room.users);
    }
    if (room.users.length === 0) delete rooms[roomId];
  });
});

// ---------------------------------------------------------------------------
// Vite SSR middleware (dev) or static serving (prod)
// ---------------------------------------------------------------------------
if (!isProd) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: rootDir,
    server: { middlewareMode: true },
    appType: 'custom',
  });

  app.use(vite.middlewares);

  app.use('*', async (req, res, next) => {
    try {
      let template = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(req.originalUrl, template);
      const { render } = await vite.ssrLoadModule('/src/entry-server.jsx');
      const appHtml = render(req.originalUrl);
      const html = template.replace('<!--app-html-->', appHtml);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
} else {
  app.use(express.static(path.join(rootDir, 'dist/client'), { index: false }));
  app.use('*', async (req, res, next) => {
    try {
      const template = fs.readFileSync(
        path.join(rootDir, 'dist/client/index.html'),
        'utf-8'
      );
      const { render } = await import(
        path.join(rootDir, 'dist/server/entry-server.js')
      );
      const appHtml = render(req.originalUrl);
      const html = template.replace('<!--app-html-->', appHtml);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      next(e);
    }
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎤 rokeroke v2  →  http://localhost:${PORT}\n`);
});

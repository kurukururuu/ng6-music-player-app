import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import path from 'path';
import { fileURLToPath } from 'url';
import YouTubeSearch from 'youtube-search-api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// In-memory state
const rooms = {}; // roomId: { users: [], playlist: [], adminId, ... }

app.use(express.static(path.join(__dirname, ''))); // Serve static files
app.use('/emojis', express.static(path.join(__dirname, 'emojis')));

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '', 'index.html'));
});

io.on('connection', (socket) => {
  socket.on('create-session', ({ username }) => {
    const roomId = nanoid(6);
    socket.join(roomId);
    const user = {
      id: socket.id,
      username,
      isAdminFlag: true,
      ping: null,
    };
    rooms[roomId] = {
      users: [user],
      playlist: [],
      adminId: socket.id,
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

  socket.on('join-session', ({ username, roomId }) => {
    const room = rooms[roomId];
    if (!room) {
      io.to(socket.id).emit('error', 'Session not found.');
      return;
    }
    socket.join(roomId);
    const user = {
      id: socket.id,
      username,
      isAdminFlag: false,
      ping: null,
    };
    room.users.push(user);
    socket.data.roomId = roomId;
    io.to(socket.id).emit('session-joined', {
      roomId,
      isAdmin: false,
      users: room.users,
      playlist: room.playlist,
      currentVideoId: room.currentVideoId,
      timestamp: room.timestamp,
      isPlaying: room.isPlaying,
      totalDuration: room.totalDuration,
      assignedUsername: username,
    });
    io.to(roomId).emit('update-user-list', room.users);

    // Send welcome message to the room
    io.to(roomId).emit('chat-message', {
      type: 'system',
      message: `${username} joined the room`,
      timestamp: Date.now(),
    });
  });

  socket.on('search-song', async (query) => {
    // There is no official free YouTube Data API for search (API key required and quota limited).
    // For demo, you can use the public "youtube-search-api" npm package (unofficial, no API key needed).
    // Example using "youtube-search-api":
    // npm install youtube-search-api

    try {
      const results = await YouTubeSearch.GetListByKeyword(query, false, 5);
      const formatted = results.items
        .filter((item) => item.type === 'video')
        .map((item) => ({
          id: item.id,
          title: item.title,
          thumbnail: item.thumbnail.thumbnails[0].url,
        }));
      io.to(socket.id).emit('search-results', formatted);
    } catch (err) {
      // fallback to dummy data
      const fallback = [
        {
          id: 'dQw4w9WgXcQ',
          title: `Sample Song: ${query}`,
          thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg',
        },
      ];
      io.to(socket.id).emit('search-results', fallback);
    }
  });

  socket.on('add-song', ({ songData }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    room.playlist.push({ ...songData, addedBy: getUsername(room, socket.id) });
    io.to(roomId).emit('update-playlist', room.playlist);
  });

  socket.on('remove-song', ({ index }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    if (room.playlist[index]) room.playlist.splice(index, 1);
    io.to(roomId).emit('update-playlist', room.playlist);
  });

  // Handlers for Move and Play Now
  socket.on('move-song', ({ from, to }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    if (
      typeof from === 'number' &&
      typeof to === 'number' &&
      from >= 0 &&
      to >= 0 &&
      from < room.playlist.length &&
      to < room.playlist.length
    ) {
      const [moved] = room.playlist.splice(from, 1);
      room.playlist.splice(to, 0, moved);
      io.to(roomId).emit('update-playlist', room.playlist);
    }
  });

  socket.on('play-now', ({ index }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    if (
      typeof index === 'number' &&
      index >= 0 &&
      index < room.playlist.length
    ) {
      // Remove the song from its current position
      const [song] = room.playlist.splice(index, 1);
      // Insert it at the start of the playlist
      room.playlist.unshift(song);
      // Update currentVideoId and play the first song
      room.currentVideoId = song.id;
      room.timestamp = 0;
      room.isPlaying = true;
      io.to(roomId).emit('update-playlist', room.playlist);
      io.to(roomId).emit('PLAY', {
        videoId: song.id,
        video_id: room.currentVideoId,
        currentTime: 0,
        totalDuration: song.duration || 0,
      });
    }
  });

  socket.on('chat-message', ({ username, message, timestamp }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;

    // Validate message length and content
    if (!message || message.trim().length === 0 || message.length > 200) return;

    const chatData = {
      username: username || getUsername(room, socket.id),
      message: message.trim(),
      timestamp: timestamp || Date.now(),
      type: 'user',
    };

    // Broadcast to all users in the room
    io.to(roomId).emit('chat-message', chatData);
  });

  socket.on('PLAY', (data) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    room.currentVideoId = data.videoId;
    room.timestamp = data.currentTime;
    room.isPlaying = true;
    room.totalDuration = data.totalDuration;
    socket.to(roomId).emit('PLAY', data);
  });

  socket.on('PAUSE', (data) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    room.timestamp = data.currentTime;
    room.isPlaying = false;
    room.totalDuration = data.totalDuration;
    socket.to(roomId).emit('PAUSE', data);
  });

  socket.on('next-song', () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    if (room.playlist.length > 0) {
      room.playlist.shift();
      io.to(roomId).emit('update-playlist', room.playlist);
      // Optionally, auto-play next song
    }
  });

  socket.on('webrtc-offer', ({ target, offer }) => {
    io.to(target).emit('webrtc-offer', { from: socket.id, offer });
  });

  socket.on('webrtc-answer', ({ target, answer }) => {
    io.to(target).emit('webrtc-answer', { from: socket.id, answer });
  });

  socket.on('webrtc-ice-candidate', ({ target, candidate }) => {
    io.to(target).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  socket.on('ping-from-client', (data) => {
    io.to(socket.id).emit('pong-to-client', data);
  });

  socket.on('report-my-ping', ({ ping }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    const user = room.users.find((u) => u.id === socket.id);
    if (user) user.ping = ping;
    io.to(roomId).emit('update-user-list', room.users);
  });

  socket.on('assign-admin', ({ newAdminUserId }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    room.users.forEach((u) => (u.isAdminFlag = u.id === newAdminUserId));
    room.adminId = newAdminUserId;
    io.to(roomId).emit('update-user-list', room.users);
    io.to(newAdminUserId).emit('you-are-now-admin');
    io.to(socket.id).emit('admin-rights-removed');
  });

  socket.on('initiate-hard-recalibration', (data) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    socket.to(roomId).emit('listeners-pause-for-recalibration');
    setTimeout(() => {
      socket.to(roomId).emit('listeners-execute-recalibration', data);
    }, 1000);
  });

  socket.on('admin-periodic-sync', (data) => {
    const roomId = socket.data.roomId;
    socket.to(roomId).emit('continuous-sync-signal', data);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    const idx = room.users.findIndex((u) => u.id === socket.id);
    if (idx !== -1) {
      const [user] = room.users.splice(idx, 1);
      io.to(roomId).emit('user-left', user);
      io.to(roomId).emit('update-user-list', room.users);
      io.to(roomId).emit('user-left-webrtc-cleanup', { socketId: socket.id });

      // Send leave message to the room
      io.to(roomId).emit('chat-message', {
        type: 'system',
        message: `${user.username} left the room`,
        timestamp: Date.now(),
      });

      // If admin left, assign new admin
      if (user.isAdminFlag && room.users.length > 0) {
        room.users[0].isAdminFlag = true;
        room.adminId = room.users[0].id;
        io.to(room.users[0].id).emit('you-are-now-admin');
        io.to(roomId).emit('update-user-list', room.users);
      }
    }
    // Clean up room if empty
    if (room.users.length === 0) delete rooms[roomId];
  });
});

function getUsername(room, socketId) {
  const user = room.users.find((u) => u.id === socketId);
  return user ? user.username : 'Unknown';
}

// server.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });

// Listen on all network interfaces (0.0.0.0)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}/`);
});

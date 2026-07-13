import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
} from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const isClient = typeof window !== 'undefined';

function safeStorage(key, fallback = '') {
  if (!isClient) return fallback;
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Initial state (SSR-safe)
// ---------------------------------------------------------------------------
function getInitialState() {
  return {
    username:       safeStorage('karaokeUsername', ''),
    theme:          safeStorage('karaokeTheme', 'light'),
    roomId:         null,
    isAdmin:        false,
    socketId:       null,
    users:          [],
    playlist:       [],
    searchResults:  [],
    chatMessages:   [],
    currentVideoId: null,
    currentSong:    null,
    isPlaying:      false,
    timestamp:      0,
    totalDuration:  0,
    notification:   null,
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------
function reducer(state, action) {
  switch (action.type) {
    case 'SET_USERNAME':
      return { ...state, username: action.payload };
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'SET_SOCKET_ID':
      return { ...state, socketId: action.payload };
    case 'SESSION_CREATED':
      return {
        ...state,
        roomId:   action.payload.roomId,
        isAdmin:  true,
        users:    action.payload.users ?? [],
        playlist: [],
      };
    case 'SESSION_JOINED':
      return {
        ...state,
        roomId:         action.payload.roomId,
        isAdmin:        false,
        users:          action.payload.users ?? [],
        playlist:       action.payload.playlist ?? [],
        currentSong:    action.payload.currentSong ?? null,
        currentVideoId: action.payload.currentVideoId ?? null,
        isPlaying:      action.payload.isPlaying ?? false,
        timestamp:      action.payload.timestamp ?? 0,
        totalDuration:  action.payload.totalDuration ?? 0,
      };
    case 'UPDATE_USERS':
      return { ...state, users: action.payload };
    case 'UPDATE_PLAYLIST':
      return { ...state, playlist: action.payload };
    case 'SEARCH_RESULTS':
      return { ...state, searchResults: action.payload };
    case 'CHAT_MESSAGE':
      return {
        ...state,
        chatMessages: [...state.chatMessages.slice(-199), action.payload],
      };
    case 'YOU_ARE_NOW_ADMIN':
      return { ...state, isAdmin: true };
    case 'CURRENT_SONG':
      return { ...state, currentSong: action.payload };
    case 'PLAY_EVENT':
      return {
        ...state,
        currentVideoId: action.payload.videoId ?? state.currentVideoId,
        isPlaying:      true,
        timestamp:      action.payload.currentTime,
        totalDuration:  action.payload.totalDuration ?? state.totalDuration,
      };
    case 'PAUSE_EVENT':
      return { ...state, isPlaying: false, timestamp: action.payload.currentTime };
    case 'NOTIFICATION':
      return { ...state, notification: action.payload };
    case 'CLEAR_NOTIFICATION':
      return { ...state, notification: null };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, getInitialState);
  const socketRef = useRef(null);

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
    try { localStorage.setItem('karaokeTheme', state.theme); } catch {}
  }, [state.theme]);

  // Socket setup — client only, lazy-loaded so SSR bundle is clean
  useEffect(() => {
    let pingInterval;
    let cleanup;

    import('socket.io-client').then(({ io }) => {
      const socket = io();
      socketRef.current = socket;

      socket.on('connect', () =>
        dispatch({ type: 'SET_SOCKET_ID', payload: socket.id })
      );

      socket.on('session-created',  (d) => dispatch({ type: 'SESSION_CREATED',  payload: d }));
      socket.on('session-joined',   (d) => dispatch({ type: 'SESSION_JOINED',   payload: d }));
      socket.on('update-user-list', (d) => dispatch({ type: 'UPDATE_USERS',     payload: d }));
      socket.on('update-playlist',  (d) => dispatch({ type: 'UPDATE_PLAYLIST',  payload: d }));
      socket.on('search-results',   (d) => dispatch({ type: 'SEARCH_RESULTS',   payload: d }));
      socket.on('chat-message',     (d) => dispatch({ type: 'CHAT_MESSAGE',     payload: d }));
      socket.on('PLAY',             (d) => dispatch({ type: 'PLAY_EVENT',       payload: d }));
      socket.on('PAUSE',            (d) => dispatch({ type: 'PAUSE_EVENT',      payload: d }));
      socket.on('current-song-update', (d) => dispatch({ type: 'CURRENT_SONG', payload: d }));
      socket.on('you-are-now-admin', () => {
        dispatch({ type: 'YOU_ARE_NOW_ADMIN' });
        dispatch({ type: 'NOTIFICATION', payload: { message: 'You are now the room admin!', type: 'success' } });
      });
      socket.on('error', (msg) =>
        dispatch({ type: 'NOTIFICATION', payload: { message: msg, type: 'error' } })
      );

      // Ping
      pingInterval = setInterval(() => {
        socket.emit('ping-from-client', { startTime: Date.now() });
      }, 5000);
      socket.on('pong-to-client', (data) => {
        socket.emit('report-my-ping', {
          ping: Math.round((Date.now() - data.startTime) / 2),
        });
      });

      cleanup = () => {
        clearInterval(pingInterval);
        socket.disconnect();
      };
    });

    return () => cleanup?.();
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const setUsername = (username) => {
    dispatch({ type: 'SET_USERNAME', payload: username });
    try { localStorage.setItem('karaokeUsername', username); } catch {}
  };

  const toggleTheme = () =>
    dispatch({ type: 'SET_THEME', payload: state.theme === 'light' ? 'dark' : 'light' });

  const createRoom = () => {
    if (!state.username.trim()) return;
    socketRef.current?.emit('create-session', { username: state.username });
  };

  const joinRoom = (roomId) => {
    if (!state.username.trim() || !roomId.trim()) return;
    socketRef.current?.emit('join-session', { username: state.username, roomId: roomId.toUpperCase() });
  };

  const searchSong     = (q)       => socketRef.current?.emit('search-song', q);
  const addSong        = (song)    => socketRef.current?.emit('add-song', { songData: song });
  const removeSong     = (index)   => socketRef.current?.emit('remove-song', { index });
  const moveSong       = (from, to)=> socketRef.current?.emit('move-song', { from, to });
  const playNow        = (index)   => socketRef.current?.emit('play-now', { index });
  const emitNextSong   = ()        => socketRef.current?.emit('next-song');
  const assignAdmin    = (userId)  => socketRef.current?.emit('assign-admin', { newAdminUserId: userId });
  const emitPlay       = (data)    => socketRef.current?.emit('PLAY', data);
  const emitPause      = (data)    => socketRef.current?.emit('PAUSE', data);
  const emitWebRTC     = (ev, d)   => socketRef.current?.emit(ev, d);
  const emitPeriodicSync = (data)  => socketRef.current?.emit('admin-periodic-sync', data);
  const emitHardRecalibration = (data) => socketRef.current?.emit('initiate-hard-recalibration', data);

  const sendChatMessage = (message) => {
    if (!message.trim()) return;
    socketRef.current?.emit('chat-message', {
      username: state.username,
      message,
      timestamp: Date.now(),
    });
  };

  const showNotification = (message, type = 'info') =>
    dispatch({ type: 'NOTIFICATION', payload: { message, type } });

  const clearNotification = () => dispatch({ type: 'CLEAR_NOTIFICATION' });

  // Expose a way for hooks to register WebRTC socket listeners
  const onSocket = (event, handler) => {
    socketRef.current?.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  };

  return (
    <AppContext.Provider
      value={{
        ...state,
        socketRef,
        // actions
        setUsername,
        toggleTheme,
        createRoom,
        joinRoom,
        searchSong,
        addSong,
        removeSong,
        moveSong,
        playNow,
        emitNextSong,
        assignAdmin,
        emitPlay,
        emitPause,
        emitWebRTC,
        emitPeriodicSync,
        emitHardRecalibration,
        sendChatMessage,
        showNotification,
        clearNotification,
        onSocket,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';

function timeAgo(ts) {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60)  return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function SessionSetup() {
  const {
    username, setUsername, createRoom, joinRoom,
    savedSessions, removeSession, rejoinRoom,
    theme, toggleTheme,
  } = useApp();
  const [roomInput, setRoomInput] = useState('');
  const [rejoiningId, setRejoiningId] = useState(null);

  const handleJoin = (e) => {
    e.preventDefault();
    joinRoom(roomInput.trim());
  };

  const handleCreate = (e) => {
    e.preventDefault();
    createRoom();
  };

  const handleRejoin = (session) => {
    setRejoiningId(session.roomId);
    rejoinRoom(session.roomId, session.username);
    // Reset spinner after timeout in case socket never responds (e.g. server down)
    setTimeout(() => setRejoiningId(null), 6000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      {/* Card */}
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-7">
          <div className="text-5xl mb-2">🎤</div>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary-600 dark:text-primary-400">
            ngorok
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time karaoke with friends
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg p-6 space-y-5">
          {/* Username */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Your name
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name…"
              autoFocus
              className="
                w-full px-3 py-2 text-sm rounded-lg
                border border-slate-200 dark:border-slate-700
                bg-slate-50 dark:bg-slate-800
                text-slate-900 dark:text-slate-100
                placeholder-slate-400
                focus:outline-none focus:ring-2 focus:ring-primary-500
                transition
              "
            />
          </div>

          {/* Continue Session */}
          {savedSessions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Continue session
              </p>
              <ul className="space-y-1.5">
                {savedSessions.map((s) => (
                  <li
                    key={s.roomId}
                    className="
                      flex items-center gap-2 rounded-lg px-3 py-2
                      border border-slate-200 dark:border-slate-700
                      bg-slate-50 dark:bg-slate-800
                    "
                  >
                    <span className="
                      font-mono text-xs font-bold tracking-widest
                      text-primary-600 dark:text-primary-400 flex-none
                    ">
                      {s.roomId}
                    </span>
                    <span className="text-xs text-slate-500 truncate flex-1">
                      {s.username} · {timeAgo(s.lastSeenAt)}
                    </span>
                    <button
                      onClick={() => handleRejoin(s)}
                      disabled={rejoiningId === s.roomId}
                      className="
                        flex-none px-2.5 py-1 text-xs font-bold rounded-lg
                        bg-primary-600 hover:bg-primary-700 text-white
                        disabled:opacity-50 disabled:cursor-not-allowed transition
                      "
                    >
                      {rejoiningId === s.roomId ? '…' : 'Rejoin'}
                    </button>
                    <button
                      onClick={() => removeSession(s.roomId)}
                      aria-label="Remove session"
                      className="
                        flex-none text-slate-400 hover:text-red-500 transition
                        text-base leading-none
                      "
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Create */}
          <button
            onClick={handleCreate}
            disabled={!username.trim()}
            className="
              w-full py-2.5 rounded-xl text-sm font-bold
              bg-primary-600 hover:bg-primary-700 text-white
              disabled:opacity-40 disabled:cursor-not-allowed
              transition shadow-sm
            "
          >
            Create a New Room
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <hr className="flex-1 border-slate-200 dark:border-slate-700" />
            <span className="text-xs text-slate-400">or join existing</span>
            <hr className="flex-1 border-slate-200 dark:border-slate-700" />
          </div>

          {/* Join */}
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              type="text"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
              placeholder="Room ID"
              maxLength={8}
              spellCheck={false}
              className="
                flex-1 px-3 py-2 text-sm rounded-lg font-mono
                border border-slate-200 dark:border-slate-700
                bg-slate-50 dark:bg-slate-800
                text-slate-900 dark:text-slate-100
                placeholder-slate-400 tracking-widest
                focus:outline-none focus:ring-2 focus:ring-primary-500
                transition
              "
            />
            <button
              type="submit"
              disabled={!username.trim() || !roomInput.trim()}
              className="
                px-4 py-2 text-sm font-bold rounded-xl
                bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600
                text-white
                disabled:opacity-40 disabled:cursor-not-allowed
                transition
              "
            >
              Join
            </button>
          </form>
        </div>

        {/* Theme toggle */}
        <div className="mt-5 text-center">
          <button
            onClick={toggleTheme}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
          >
            {theme === 'light' ? '🌙 Dark mode' : '☀️ Light mode'}
          </button>
        </div>
      </div>
    </div>
  );
}

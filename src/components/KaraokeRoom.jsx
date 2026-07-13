import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer.js';
import { useWebRTC } from '../hooks/useWebRTC.js';
import Playlist from './Playlist.jsx';
import UserList from './UserList.jsx';
import Chat from './Chat.jsx';
import SearchBar from './SearchBar.jsx';

export default function KaraokeRoom() {
  const {
    roomId, isAdmin, username, users, socketRef,
    currentSong, currentVideoId, isPlaying, timestamp, totalDuration, playlist,
    emitPlay, emitPause, emitNextSong, emitPeriodicSync, emitHardRecalibration, playNow,
    theme, toggleTheme, showNotification,
  } = useApp();

  const [ytVolume, setYtVolumeState]       = useState(100);
  const [singerVolume, setSingerVolume]    = useState(1);
  const [progress, setProgress]           = useState(0);
  const [currentDur, setCurrentDur]       = useState(0);
  const [isSearchOpen, setSearchOpen]     = useState(false);

  const audioDelayMs     = useRef(200);
  const syncIntervalRef  = useRef(null);
  const progIntervalRef  = useRef(null);

  // YouTube player
  const {
    isReady, loadVideo, play, pause,
    seekTo, setVolume, getCurrentTime, getDuration, getVideoData,
  } = useYouTubePlayer({
    containerId: 'yt-player',
    isAdmin,
    onStateChange: handleYTStateChange,
  });

  // WebRTC
  const { isSinging, startSinging, stopSinging } = useWebRTC({
    socketRef,
    users,
    singerVolume,
  });

  // Apply initial room state once player is ready
  useEffect(() => {
    if (!isReady || !currentVideoId) return;
    const t = isAdmin
      ? timestamp
      : Math.max(0, timestamp - audioDelayMs.current / 1000);
    loadVideo(currentVideoId, t);
    if (isPlaying) play(); else pause();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  // Admin: react to PLAY socket events (play-now, next-song auto-advance, etc.)
  useEffect(() => {
    if (!isReady || !isAdmin) return;
    const socket = socketRef.current;
    if (!socket) return;

    const onPlay = (data) => {
      loadVideo(data.videoId, data.currentTime ?? 0);
      play();
      setCurrentDur(data.totalDuration ?? 0);
    };

    socket.on('PLAY', onPlay);
    return () => socket.off('PLAY', onPlay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, isAdmin, socketRef.current]);

  // Listener: react to PLAY / PAUSE / sync signals from socket
  useEffect(() => {
    if (!isReady || isAdmin) return;
    const socket = socketRef.current;
    if (!socket) return;

    const onPlay = (data) => {
      const t = Math.max(0, data.currentTime - audioDelayMs.current / 1000);
      loadVideo(data.videoId, t);
      play();
      setCurrentDur(data.totalDuration ?? 0);
      startProgress();
    };

    const onPause = (data) => {
      pause();
      seekTo(data.currentTime);
      stopProgress();
    };

    const onSync = (data) => {
      const expected = data.adminYouTubeTime - audioDelayMs.current / 1000;
      const drift = Math.abs(getCurrentTime() - expected);
      if (drift > 1.5) seekTo(expected);
    };

    const onPauseForRecal = () => pause();
    const onExecuteRecal  = (data) => {
      audioDelayMs.current = data.newDelayMs ?? audioDelayMs.current;
      const t = Math.max(0, data.adminYouTubeTime - audioDelayMs.current / 1000);
      seekTo(t);
      play();
    };

    socket.on('PLAY',                           onPlay);
    socket.on('PAUSE',                          onPause);
    socket.on('continuous-sync-signal',         onSync);
    socket.on('listeners-pause-for-recalibration', onPauseForRecal);
    socket.on('listeners-execute-recalibration',   onExecuteRecal);

    return () => {
      socket.off('PLAY',                           onPlay);
      socket.off('PAUSE',                          onPause);
      socket.off('continuous-sync-signal',         onSync);
      socket.off('listeners-pause-for-recalibration', onPauseForRecal);
      socket.off('listeners-execute-recalibration',   onExecuteRecal);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, isAdmin, socketRef.current]);

  function handleYTStateChange(event) {
    const YT = window.YT;
    if (!YT) return;
    const dur = getDuration();
    setCurrentDur(dur);

    if (!isAdmin) {
      if (event.data === YT.PlayerState.PLAYING) startProgress();
      else stopProgress();
      return;
    }

    // Admin
    const { video_id: videoId } = getVideoData();
    const currentTime = getCurrentTime();

    if (event.data === YT.PlayerState.PLAYING) {
      emitPlay({ currentTime, videoId, totalDuration: dur, adminActionTimestamp: performance.now() });
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = setInterval(() => {
        emitPeriodicSync({
          adminYouTubeTime: getCurrentTime(),
          adminActionTimestamp: performance.now(),
          totalDuration: getDuration(),
        });
      }, 2000);
    } else if (event.data === YT.PlayerState.PAUSED) {
      emitPause({ currentTime, videoId, totalDuration: dur });
      clearInterval(syncIntervalRef.current);
    } else if (event.data === YT.PlayerState.ENDED) {
      clearInterval(syncIntervalRef.current);
      emitNextSong();
    }
  }

  function startProgress() {
    clearInterval(progIntervalRef.current);
    progIntervalRef.current = setInterval(() => {
      const d = getDuration();
      const t = getCurrentTime();
      if (d > 0) setProgress((t / d) * 100);
    }, 250);
  }
  function stopProgress() {
    clearInterval(progIntervalRef.current);
  }

  useEffect(() => () => {
    clearInterval(syncIntervalRef.current);
    clearInterval(progIntervalRef.current);
  }, []);

  const handleSetYtVolume = (v) => { setYtVolumeState(v); setVolume(v); };

  const handleStartSinging = async () => {
    try {
      await startSinging();
      showNotification('Microphone on — you are now singing! 🎤', 'success');
    } catch {
      showNotification('Could not access microphone.', 'error');
    }
  };
  const handleStopSinging = () => {
    stopSinging();
    showNotification('Stopped singing.', 'info');
  };

  const handleSync = () => {
    emitHardRecalibration({
      adminYouTubeTime: getCurrentTime(),
      newDelayMs: audioDelayMs.current,
    });
    showNotification('Syncing all guests…', 'info');
  };

  const handlePlay = () => {
    if (!currentSong && playlist.length > 0) {
      playNow(0);
    } else {
      play();
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId).catch(() => {});
    showNotification('Room ID copied!', 'success');
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="
        flex-none flex items-center justify-between
        px-4 h-11 gap-4
        bg-white dark:bg-slate-900
        border-b border-slate-200 dark:border-slate-800
        shadow-sm
      ">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-base font-extrabold text-primary-600 dark:text-primary-400 whitespace-nowrap">
            🎤 ngorok
          </span>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Room</span>
            <code className="
              font-mono text-xs font-bold tracking-widest
              bg-primary-50 dark:bg-primary-900/20
              text-primary-600 dark:text-primary-400
              px-2 py-0.5 rounded
            ">{roomId}</code>
            <button onClick={copyRoomId} title="Copy room ID"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition text-xs leading-none">
              ⎘
            </button>
          </div>
          {isAdmin && (
            <span className="
              hidden sm:inline-flex text-xs font-semibold
              bg-primary-100 dark:bg-primary-900/30
              text-primary-700 dark:text-primary-300
              px-2 py-0.5 rounded-full
            ">👑 Admin</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-none">
          <span className="text-xs text-slate-400 hidden sm:inline">{users.length} online</span>
          <button onClick={toggleTheme}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-sm">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left panel ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

          {/* Video */}
          <div className="relative bg-black rounded-xl overflow-hidden shadow-md" style={{ aspectRatio: '16/9' }}>
            <div id="yt-player" className="absolute inset-0 w-full h-full" />
            {!isReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                <span className="text-slate-400 text-sm animate-pulse">Loading player…</span>
              </div>
            )}
          </div>

          {/* Progress bar — listener */}
          {!isAdmin && currentDur > 0 && (
            <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden -mt-1.5">
              <div
                className="h-full bg-primary-500 transition-all duration-300 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Controls */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <>
                  <Btn onClick={handlePlay}    variant="primary">▶ Play</Btn>
                  <Btn onClick={pause}        variant="default">⏸ Pause</Btn>
                  <Btn onClick={emitNextSong} variant="default">⏭ Next</Btn>
                  <Btn onClick={handleSync}   variant="default">⟳ Sync</Btn>
                  <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 self-center" />
                </>
              )}
              {isSinging
                ? <Btn onClick={handleStopSinging} variant="danger">🎤 Stop Singing</Btn>
                : <Btn onClick={handleStartSinging} variant="success">🎤 Start Singing</Btn>
              }
            </div>

            {/* Volume sliders */}
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Music — {ytVolume}%
                </label>
                <input type="range" min="0" max="100" value={ytVolume}
                  onChange={(e) => handleSetYtVolume(+e.target.value)}
                  className="w-full h-1.5 accent-primary-500 cursor-pointer" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Singers — {Math.round(singerVolume * 100)}%
                </label>
                <input type="range" min="0" max="1" step="0.01" value={singerVolume}
                  onChange={(e) => setSingerVolume(+e.target.value)}
                  className="w-full h-1.5 accent-primary-500 cursor-pointer" />
              </div>
            </div>
          </div>

          </main>

          {/* Search — outside overflow-y scroll so panel can float upward */}
          <div className="flex-none px-3 pb-3 relative">
            <button
              onClick={() => setSearchOpen((o) => !o)}
              className="
                w-full flex items-center justify-between
                px-4 py-2.5 rounded-xl text-sm font-semibold
                bg-white dark:bg-slate-900
                border border-slate-200 dark:border-slate-800
                text-slate-600 dark:text-slate-300
                hover:bg-slate-50 dark:hover:bg-slate-800
                transition
              ">
              <span>🔍 Add a Song</span>
              <span className="text-slate-400">{isSearchOpen ? '▲' : '▼'}</span>
            </button>
            {isSearchOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 z-40 drop-shadow-xl">
                <SearchBar />
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar ───────────────────────────────────────── */}
        <aside className="
          w-72 flex-none flex flex-col overflow-hidden
          border-l border-slate-200 dark:border-slate-800
          bg-white dark:bg-slate-900
        ">
          <UserList />

          {/* Now Playing */}
          <div className="flex-none border-t border-slate-200 dark:border-slate-800 px-3 py-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Now Playing</h3>
            {currentSong ? (
              <div className="flex items-center gap-2">
                {currentSong.thumbnail && (
                  <img
                    src={currentSong.thumbnail}
                    alt=""
                    className="w-10 h-10 rounded object-cover flex-none bg-slate-200 dark:bg-slate-700"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-primary-600 dark:text-primary-400 truncate leading-tight">
                    {currentSong.title}
                  </p>
                  {currentSong.addedBy && (
                    <p className="text-xs text-slate-400 truncate">by {currentSong.addedBy}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Nothing playing</p>
            )}
          </div>
          <div className="flex-1 overflow-hidden flex flex-col border-t border-slate-200 dark:border-slate-800">
            <Playlist />
          </div>
          <div className="flex-none h-56 border-t border-slate-200 dark:border-slate-800">
            <Chat />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Btn({ onClick, children, variant = 'default' }) {
  const base = 'px-3 py-1.5 rounded-lg text-xs font-bold transition';
  const variants = {
    primary: 'bg-primary-600 hover:bg-primary-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    danger:  'bg-red-600 hover:bg-red-700 text-white',
    default: 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300',
  };
  return (
    <button onClick={onClick} className={`${base} ${variants[variant]}`}>
      {children}
    </button>
  );
}

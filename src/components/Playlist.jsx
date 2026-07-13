import { useApp } from '../context/AppContext.jsx';

export default function Playlist() {
  const { playlist, isAdmin, removeSong, moveSong, playNow } = useApp();

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-none px-3 py-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Playlist
          <span className="ml-1.5 text-slate-500">({playlist.length})</span>
        </h3>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {playlist.length === 0 ? (
          <p className="text-xs text-center text-slate-400 py-6 px-3">
            No songs queued yet
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {playlist.map((song, i) => (
              <li
                key={`${song.id}-${i}`}
                className="flex items-start gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition"
              >
                {/* Index */}
                <span className="flex-none text-xs text-slate-400 w-4 mt-px">{i + 1}.</span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p
                    title={song.title}
                    className="text-xs font-medium truncate text-slate-800 dark:text-slate-200"
                  >
                    {song.title}
                  </p>
                  {song.addedBy && (
                    <p className="text-xs text-slate-400 truncate">by {song.addedBy}</p>
                  )}
                </div>

                {/* Admin actions */}
                {isAdmin && (
                  <div className="flex-none flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                    <IconBtn
                      onClick={() => i > 0 && moveSong(i, i - 1)}
                      disabled={i === 0}
                      title="Move up"
                    >↑</IconBtn>
                    <IconBtn
                      onClick={() => i < playlist.length - 1 && moveSong(i, i + 1)}
                      disabled={i === playlist.length - 1}
                      title="Move down"
                    >↓</IconBtn>
                    <IconBtn onClick={() => playNow(i)} title="Play now" className="hover:text-green-500">
                      ▶
                    </IconBtn>
                    <IconBtn onClick={() => removeSong(i)} title="Remove" className="hover:text-red-500">
                      ✕
                    </IconBtn>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function IconBtn({ onClick, children, title, disabled, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        w-5 h-5 flex items-center justify-center text-xs rounded
        text-slate-400 hover:text-slate-700 dark:hover:text-slate-200
        disabled:opacity-30 disabled:cursor-not-allowed
        transition ${className}
      `}
    >
      {children}
    </button>
  );
}

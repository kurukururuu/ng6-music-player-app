import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';

export default function SearchBar() {
  const { searchResults, searchSong, addSong, showNotification } = useApp();
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    searchSong(query.trim());
    // loading state resets when results arrive — we just fake a short delay
    setTimeout(() => setLoading(false), 1500);
  };

  const handleAdd = (song) => {
    addSong(song);
    showNotification(`"${song.title}" added to playlist`, 'success');
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search YouTube…"
          className="
            flex-1 px-3 py-2 text-sm rounded-lg
            border border-slate-200 dark:border-slate-700
            bg-slate-50 dark:bg-slate-800
            text-slate-900 dark:text-slate-100
            placeholder-slate-400
            focus:outline-none focus:ring-2 focus:ring-primary-500
            transition
          "
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="
            px-4 py-2 text-sm font-bold rounded-lg
            bg-primary-600 hover:bg-primary-700
            disabled:opacity-50 disabled:cursor-not-allowed
            text-white transition
          "
        >
          {loading ? '…' : 'Search'}
        </button>
      </form>

      {searchResults.length > 0 && (
        <ul className="mt-3 space-y-2">
          {searchResults.map((song) => (
            <li key={song.id}
              className="
                flex items-center gap-3 p-2 rounded-xl
                hover:bg-slate-50 dark:hover:bg-slate-800
                transition group
              ">
              {song.thumbnail && (
                <img
                  src={song.thumbnail} alt=""
                  loading="lazy"
                  className="w-14 h-10 object-cover rounded-lg flex-none bg-slate-200" />
              )}
              <span className="flex-1 text-xs text-slate-700 dark:text-slate-300 line-clamp-2 leading-tight">
                {song.title}
              </span>
              <button
                onClick={() => handleAdd(song)}
                className="
                  flex-none px-2.5 py-1 text-xs font-bold rounded-lg
                  bg-primary-100 dark:bg-primary-900/30
                  text-primary-700 dark:text-primary-300
                  hover:bg-primary-200 dark:hover:bg-primary-800/40
                  transition
                ">
                + Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

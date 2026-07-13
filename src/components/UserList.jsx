import { useApp } from '../context/AppContext.jsx';

const PALETTE = ['#D32F2F', '#303F9F', '#00796B', '#FBC02D', '#5D4037', '#E64A19'];

function colorFor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h << 5) - h + name.charCodeAt(i); h |= 0; }
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export default function UserList() {
  const { users, username, isAdmin, assignAdmin, socketRef } = useApp();

  return (
    <div className="flex-none px-3 py-2">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
        Online ({users.length})
      </h3>
      <ul className="space-y-1.5 max-h-28 overflow-y-auto">
        {users.map((user) => (
          <li key={user.id} className="flex items-center gap-2 group">
            {/* Avatar */}
            <div
              className="w-5 h-5 rounded-full flex-none flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: colorFor(user.username) }}
            >
              {user.username[0]?.toUpperCase()}
            </div>

            {/* Name */}
            <span className={`flex-1 text-xs truncate ${user.username === username ? 'font-semibold' : ''}`}>
              {user.isAdminFlag && <span className="mr-0.5">👑</span>}
              {user.username}
              {user.username === username && (
                <span className="ml-1 text-slate-400 font-normal">(you)</span>
              )}
            </span>

            {/* Ping */}
            {user.ping != null && (
              <span className={`text-xs flex-none font-mono ${
                user.ping < 80  ? 'text-green-500' :
                user.ping < 200 ? 'text-yellow-500' : 'text-red-500'
              }`}>{user.ping}ms</span>
            )}

            {/* Assign admin (admin only, hover) */}
            {isAdmin && !user.isAdminFlag && (
              <button
                onClick={() => assignAdmin(user.id)}
                title="Make admin"
                className="opacity-0 group-hover:opacity-100 text-xs text-primary-400 hover:text-primary-600 transition"
              >
                👑
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

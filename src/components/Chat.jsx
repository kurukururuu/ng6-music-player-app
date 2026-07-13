import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';

// ── Custom emoji definitions (mirrors emoji.js) ───────────────────────────
const CUSTOM_CATEGORIES = [
  {
    id: 'custom',
    name: 'Custom',
    emojis: [
      { id: 'pepesad',   name: 'PepeFrog Sad',          keywords: ['pepe','frog','sad','pepesad'],                  skins: [{ src: '/emojis/pepesad.png' }] },
      { id: 'pepesus',   name: 'PepeFrog Suspicious',    keywords: ['pepe','frog','sus','pepesus','suspicious'],     skins: [{ src: 'https://c.tenor.com/0xCrJdbI4vgAAAAC/tenor.gif' }] },
      { id: 'pepeshock', name: 'PepeFrog Shocked',       keywords: ['pepe','frog','shocked','pepeshock','surprised'],skins: [{ src: '/emojis/pepeshock.jpeg' }] },
      { id: 'kekw',      name: 'KEKW',                   keywords: ['kekw','laugh','funny','lol'],                  skins: [{ src: '/emojis/kekw.png' }] },
    ],
  },
];

const CUSTOM_MAP = {};
for (const cat of CUSTOM_CATEGORIES) {
  for (const em of cat.emojis) CUSTOM_MAP[em.id] = em.skins[0].src;
}

// ── EmojiMart: init once per page load ───────────────────────────────────
let _emojiReady = false;
async function ensureEmojiMart() {
  if (_emojiReady) return true;
  let tries = 0;
  while (!window.EmojiMart?.data && tries++ < 50)
    await new Promise((r) => setTimeout(r, 100));
  if (!window.EmojiMart?.data) return false;
  await window.EmojiMart.init({ data: window.EmojiMart.data, custom: CUSTOM_CATEGORIES });
  _emojiReady = true;
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────────────
const PALETTE = ['#D32F2F', '#303F9F', '#00796B', '#FBC02D', '#5D4037', '#E64A19'];
function colorFor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h << 5) - h + name.charCodeAt(i); h |= 0; }
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Render a message string, replacing :id: shortcodes with <img> elements */
function MessageText({ text }) {
  const parts = text.split(/(:[a-z0-9_]+:)/g);
  return (
    <span className="text-slate-700 dark:text-slate-300 break-words inline">
      {parts.map((part, i) => {
        if (/^:[a-z0-9_]+:$/.test(part)) {
          const id = part.slice(1, -1);
          const src = CUSTOM_MAP[id];
          if (src) return <img key={i} src={src} alt={part} title={part} className="inline w-4 h-4 align-bottom mx-px" />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────
export default function Chat() {
  const { chatMessages, sendChatMessage } = useApp();
  const [input, setInput]             = useState('');
  const [emojiHits, setEmojiHits]     = useState([]);   // search results
  const [triggerIdx, setTriggerIdx]   = useState(-1);   // index of ':' in input
  const [activeIdx, setActiveIdx]     = useState(0);    // keyboard-selected row
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { ensureEmojiMart(); }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const closeDropdown = () => { setEmojiHits([]); setTriggerIdx(-1); setActiveIdx(0); };

  const handleChange = async (e) => {
    const val    = e.target.value;
    const cursor = e.target.selectionStart;
    setInput(val);

    const before    = val.slice(0, cursor);
    const lastColon = before.lastIndexOf(':');

    if (lastColon !== -1 && (lastColon === 0 || /\s/.test(before[lastColon - 1]))) {
      const term = before.slice(lastColon + 1);
      if (term.length > 0 && !term.includes(' ')) {
        await ensureEmojiMart();
        const results = await window.EmojiMart?.SearchIndex?.search(term);
        if (results?.length) {
          setEmojiHits(results.slice(0, 6));
          setTriggerIdx(lastColon);
          setActiveIdx(0);
          return;
        }
      }
    }
    closeDropdown();
  };

  const insertEmoji = (emoji) => {
    const skin      = emoji.skins[0];
    const isCustom  = !skin.native && skin.src;
    const value     = isCustom ? `:${emoji.id}:` : skin.native;
    const cursor    = inputRef.current?.selectionStart ?? input.length;
    const next      = input.slice(0, triggerIdx) + value + input.slice(cursor);
    setInput(next);
    closeDropdown();
    requestAnimationFrame(() => {
      const pos = triggerIdx + value.length;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const send = () => {
    const msg = input.trim();
    if (!msg) return;
    sendChatMessage(msg);
    setInput('');
    closeDropdown();
  };

  const handleKeyDown = (e) => {
    if (emojiHits.length > 0) {
      if (e.key === 'ArrowDown')  { e.preventDefault(); setActiveIdx((i) => (i + 1) % emojiHits.length); return; }
      if (e.key === 'ArrowUp')    { e.preventDefault(); setActiveIdx((i) => (i - 1 + emojiHits.length) % emojiHits.length); return; }
      if (e.key === 'Enter')      { e.preventDefault(); insertEmoji(emojiHits[activeIdx]); return; }
      if (e.key === 'Escape')     { closeDropdown(); return; }
    }
    if (e.key === 'Enter') send();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none px-3 py-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Chat</h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1.5 pb-1">
        {chatMessages.length === 0 && (
          <p className="text-xs text-slate-400 italic text-center py-2">No messages yet</p>
        )}
        {chatMessages.map((msg, i) =>
          msg.type === 'system' ? (
            <p key={i} className="text-center text-xs text-slate-400 italic">{msg.message}</p>
          ) : (
            <div key={i} className="text-xs leading-snug">
              <span className="font-bold mr-1" style={{ color: colorFor(msg.username) }}>
                {msg.username}:
              </span>
              <MessageText text={msg.message} />
              <span className="ml-1.5 text-slate-400">{formatTime(msg.timestamp)}</span>
            </div>
          )
        )}
        <div ref={endRef} />
      </div>

      {/* Input + emoji dropdown (positioned above) */}
      <div className="flex-none px-3 py-2 relative">
        {emojiHits.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden z-50">
            {emojiHits.map((emoji, i) => {
              const skin     = emoji.skins[0];
              const isCustom = !skin.native && skin.src;
              return (
                <button
                  key={emoji.id}
                  onMouseDown={(e) => { e.preventDefault(); insertEmoji(emoji); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition ${
                    i === activeIdx
                      ? 'bg-primary-50 dark:bg-primary-900/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {isCustom
                    ? <img src={skin.src} alt={emoji.id} className="w-5 h-5 object-contain flex-none" />
                    : <span className="text-base leading-none">{skin.native}</span>}
                  <span className="text-slate-500 dark:text-slate-400">:{emoji.id}:</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Message… (: for emoji)"
            maxLength={200}
            className="
              flex-1 px-2.5 py-1.5 text-xs rounded-lg
              bg-slate-100 dark:bg-slate-800
              border border-slate-200 dark:border-slate-700
              text-slate-900 dark:text-slate-100
              placeholder-slate-400
              focus:outline-none focus:ring-1 focus:ring-primary-500
              transition
            "
          />
          <button
            onClick={send}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}


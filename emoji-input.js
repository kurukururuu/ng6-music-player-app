// Emoji autocomplete for chat input using Emoji Mart CDN build
// Assumes EmojiMart is loaded globally from CDN in index.html

const input = document.getElementById('chat-input');
const results = document.getElementById('emoji-results');

let emojiIndex = null;
let dropdownVisible = false;
let searchTerm = '';
let triggerIndex = -1;

// Custom emojis must be passed via the `custom` option to EmojiMart.init(),
// NOT injected directly into EmojiMart.data.emojis.
// Each skin must use `src` (not `url`) per the official API.
const customEmojiCategories = [
  {
    id: 'custom',
    name: 'Custom',
    emojis: [
      {
        id: 'pepesad',
        name: 'PepeFrog Sad',
        keywords: ['pepe', 'frog', 'sad', 'pepesad'],
        skins: [{ src: '/emojis/pepesad.png' }],
      },
      {
        id: 'pepesus',
        name: 'PepeFrog Suspicious',
        keywords: ['pepe', 'frog', 'sus', 'pepesus', 'suspicious'],
        skins: [{ src: 'https://c.tenor.com/0xCrJdbI4vgAAAAC/tenor.gif' }],
      },
      {
        id: 'pepeshock',
        name: 'PepeFrog Shocked',
        keywords: ['pepe', 'frog', 'shocked', 'pepeshock', 'surprised'],
        skins: [{ src: '/emojis/pepeshock.jpeg' }],
      },
      {
        id: 'kekw',
        name: 'KEKW',
        keywords: ['kekw', 'laugh', 'funny', 'lol'],
        skins: [{ src: '/emojis/kekw.png' }],
      }
    ],
  },
];

// Wait for EmojiMart and its data to be fully ready before initializing.
// EmojiMart.data is set asynchronously by the inline module script in index.html,
// so we poll until it is available.
async function initEmojiMart() {
  let attempts = 0;
  while ((!window.EmojiMart || !window.EmojiMart.data) && attempts < 50) {
    await new Promise((r) => setTimeout(r, 100));
    attempts++;
  }
  if (!window.EmojiMart || !window.EmojiMart.data) {
    console.warn('[emoji-input] EmojiMart data not available after waiting.');
    return;
  }
  if (EmojiMart.init) {
    await EmojiMart.init({ data: EmojiMart.data, custom: customEmojiCategories });
    emojiIndex = EmojiMart.SearchIndex;
    console.log('[emoji-input] EmojiMart initialized with custom emojis.');
  }
}

initEmojiMart();

// Build a flat shortcode→src map from customEmojiCategories for rendering in chat.
const customEmojiMap = {};
for (const category of customEmojiCategories) {
  for (const emoji of category.emojis) {
    customEmojiMap[emoji.id] = emoji.skins[0].src;
  }
}

/**
 * Replace custom emoji shortcodes like :pepesad: with <img> tags.
 * Exposed globally so app.js can call it when rendering chat messages.
 */
window.renderCustomEmojis = function (text) {
  return text.replace(/:([a-z0-9_]+):/g, (match, id) => {
    const src = customEmojiMap[id];
    if (!src) return match; // not a custom emoji, leave as-is
    return `<img src="${src}" alt=":${id}:" title=":${id}:" style="width:16px;height:16px;vertical-align:bottom;display:inline-block;">`;
  });
};

// Helper: Get the plain text before the cursor inside the contenteditable div.
function getTextBeforeCursor() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return '';
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const preRange = document.createRange();
  preRange.selectNodeContents(input);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString();
}

// Helper: Show/hide dropdown
function showDropdown() {
  results.style.display = 'block';
  dropdownVisible = true;
}
function hideDropdown() {
  results.style.display = 'none';
  results.innerHTML = '';
  dropdownVisible = false;
  searchTerm = '';
  triggerIndex = -1;
}

// Listen for input
input.addEventListener('input', async (e) => {
  const textBeforeCursor = getTextBeforeCursor();
  const lastColon = textBeforeCursor.lastIndexOf(':');
  if (
    lastColon !== -1 &&
    (lastColon === 0 || /\s/.test(textBeforeCursor[lastColon - 1]))
  ) {
    const term = textBeforeCursor.slice(lastColon + 1);
    if (term.length > 0 && !term.includes(' ')) {
      if (!emojiIndex && window.EmojiMart && EmojiMart.SearchIndex) {
        emojiIndex = EmojiMart.SearchIndex;
      }
      if (emojiIndex) {
        const resultsList = await emojiIndex.search(term);
        console.log('resultList', resultsList);

        if (resultsList && resultsList.length) {
          // Render dropdown — custom emojis have `src` (image), native emojis have `native` (char)
          results.innerHTML = resultsList
            .slice(0, 4)
            .map((item, i) => {
              const skin = item.skins[0];
              const isCustom = !skin.native && skin.src;
              const display = isCustom
                ? `<img src="${skin.src}" alt="${item.id}" style="width:20px;height:20px;vertical-align:text-bottom;">`
                : skin.native;
              const emojiValue = isCustom ? `:${item.id}:` : skin.native;
              return `<div class="emoji-autocomplete-item" data-index="${i}" data-emoji="${emojiValue}" tabindex="0" style="padding:4px;cursor:pointer;display:flex;align-items:center;gap:6px;">${display} <span style='font-size:12px;color:#888;'>:${item.id}:</span></div>`;
            })
            .join('');
          showDropdown();
          searchTerm = term;
          triggerIndex = lastColon;
        } else {
          hideDropdown();
        }
      }
    } else {
      hideDropdown();
    }
  } else {
    hideDropdown();
  }
});

function insertEmoji(item) {
  if (!item) return;
  const emojiValue = item.dataset.emoji; // native char or ':id:'
  const isCustom =
    emojiValue &&
    emojiValue.startsWith(':') &&
    emojiValue.endsWith(':') &&
    emojiValue.length > 2;
  const customId = isCustom ? emojiValue.slice(1, -1) : null;
  const customSrc = customId ? customEmojiMap[customId] : null;

  const sel = window.getSelection();
  if (!sel.rangeCount) { hideDropdown(); return; }

  const range = sel.getRangeAt(0);
  range.collapse(true);

  // The cursor must be in a text node — find ':' within it and delete `:term`
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) { hideDropdown(); return; }

  const text = node.textContent;
  const cursorOffset = range.startOffset;
  const colonIdx = text.lastIndexOf(':', cursorOffset - 1);
  if (colonIdx === -1) { hideDropdown(); return; }

  // Delete from ':' to cursor
  const deleteRange = document.createRange();
  deleteRange.setStart(node, colonIdx);
  deleteRange.setEnd(node, cursorOffset);
  deleteRange.deleteContents();

  if (isCustom && customSrc) {
    // Insert an <img> inline for custom emojis
    const img = document.createElement('img');
    img.src = customSrc;
    img.alt = emojiValue;
    img.title = emojiValue;
    img.style.cssText =
      'width:16px;height:16px;vertical-align:text-bottom;display:inline-block;';
    deleteRange.insertNode(img);
    // Place cursor after the img with a zero-width space anchor
    const anchor = document.createTextNode('\u200B');
    img.after(anchor);
    const newRange = document.createRange();
    newRange.setStart(anchor, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  } else {
    // Native emoji — insert as plain text
    document.execCommand('insertText', false, emojiValue);
  }

  input.focus();
  setTimeout(hideDropdown, 100);
}
// Handle click on emoji result
results.addEventListener('mousedown', function (e) {
  console.log('mouse click', e.target);

  const item = e.target.closest('.emoji-autocomplete-item');
  insertEmoji(item);
});

// Hide dropdown on blur (with delay for click)
document.addEventListener('click', (e) => {
  if (!input.contains(e.target) && !results.contains(e.target)) {
    hideDropdown();
  }
});

function navigateThroughResults(e) {
  if (!dropdownVisible) return;
  const items = Array.from(
    results.querySelectorAll('.emoji-autocomplete-item'),
  );
  const active = document.activeElement;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (active.closest('.emoji-autocomplete-item')) {
      const next = active.nextElementSibling || items[0];
      next.focus();
    } else if (items.length) {
      items[0].focus();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (active.closest('.emoji-autocomplete-item')) {
      const prev = active.previousElementSibling || items[items.length - 1];
      prev.focus();
    }
  } else if (e.key === 'Enter') {
    if (items.length === 1) {
      insertEmoji(items[0]);
    } else {
      insertEmoji(active.closest('.emoji-autocomplete-item'));
    }
    e.preventDefault();
  } else if (e.key === 'Escape') {
    hideDropdown();
  }
}

// Optional: Keyboard navigation for dropdown
input.addEventListener('keydown', (e) => {
  navigateThroughResults(e);
});
const resultsObserver = new MutationObserver(() => {
  const items = results.querySelectorAll('.emoji-autocomplete-item');
  items.forEach((item) => {
    item.addEventListener('keydown', navigateThroughResults);
  });
});
resultsObserver.observe(results, { childList: true });

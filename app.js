const socket = io();

// --- State ---
let isAdmin = false;
let player;
let timeUpdater; // For admin's SYNC_TIME and continuous sync
let progressUpdaterInterval; // For listener's custom progress bar
let isApiReady = false;
let queuedInitialState = null;
let localAudioStream = null;
let roomUsers = [];
const peerConnections = {};
let myCalculatedAudioDelayMs = 200; // Each listener's own delay, starts with a default
let pingInterval;
let currentUsername = '';
const personallyMutedSingers = {};
let currentSongDuration = 0; // For listener's progress bar

const userNameColors = [
  '#D32F2F',
  '#303F9F',
  '#00796B',
  '#FBC02D',
  '#5D4037',
  '#E64A19',
];

// --- DOM Elements ---
const sessionSetupDiv = document.getElementById('session-setup');
const karaokeRoomDiv = document.getElementById('karaoke-room');
const usernameInput = document.getElementById('username-input');
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const roomIdInput = document.getElementById('room-id-input');
const sessionIdDisplay = document.getElementById('session-id-display');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchResultsDiv = document.getElementById('search-results');
const playlistDiv = document.getElementById('playlist');
const controlsContainer = document.getElementById('controls-container');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const nextSongBtn = document.getElementById('next-song-btn');
const startSingingBtn = document.getElementById('start-singing-btn');
const muteBtn = document.getElementById('mute-btn');
const audioStreamsContainer = document.getElementById(
  'audio-streams-container'
);
const calibrateSyncBtn = document.getElementById('calibrate-sync-btn');
const userListUl = document.getElementById('user-list');
const notificationPopup = document.getElementById('notification-popup');
const notificationMessage = document.getElementById('notification-message');
const listenerVolumeControlsDiv = document.getElementById(
  'listener-volume-controls'
);
const youtubeVolumeSlider = document.getElementById('youtube-volume-slider');
const singerVolumeSlider = document.getElementById('singer-volume-slider');
const customProgressBarContainer = document.getElementById(
  'custom-progress-bar-container'
);
const customProgressBar = document.getElementById('custom-progress-bar');
const chatMessagesDiv = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

// emoji
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const emojiResults = document.getElementById('emoji-results');

// Show/hide emoji picker
emojiBtn.addEventListener('click', () => {
  emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none';
});

// Insert emoji into chat input
emojiPicker.addEventListener('emoji-click', event => {
  chatInput.focus();
  document.execCommand('insertText', false, event.detail.unicode);
  emojiPicker.style.display = 'none';
});

// Hide emoji picker when clicking outside
document.addEventListener('click', (e) => {
  if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
    emojiPicker.style.display = 'none';
  }
});

// --- Notification System ---
let notificationTimeout;
function showNotification(message, type = 'info', duration = 3000) {
  if (notificationTimeout) clearTimeout(notificationTimeout);
  notificationMessage.textContent = message;
  notificationPopup.className = ''; // Clear previous classes
  notificationPopup.classList.add('notification-popup'); // Base class
  notificationPopup.classList.add(type); // Type specific class
  notificationPopup.classList.add('show');
  notificationTimeout = setTimeout(() => {
    notificationPopup.classList.remove('show');
    notificationPopup.classList.add('hidden');
  }, duration);
}

// --- Username and Button State Logic ---
function updateSessionButtonsState() {
  const username = usernameInput.value.trim();
  const canProceed = username !== '';
  createBtn.disabled = !canProceed;
  joinBtn.disabled = !canProceed;
}
window.addEventListener('DOMContentLoaded', async () => {
  const savedUsername = localStorage.getItem('karaokeUsername');
  if (savedUsername) {
    usernameInput.value = savedUsername;
    currentUsername = savedUsername;
  }
  updateSessionButtonsState();
});
usernameInput.addEventListener('input', updateSessionButtonsState);

// --- Chat Functions ---
// Serialize the contenteditable chat input to plain text,
// converting inline custom emoji <img> tags back to :id: shortcodes.
function serializeChatInput() {
  const clone = chatInput.cloneNode(true);
  clone.querySelectorAll('img').forEach((img) => {
    img.replaceWith(document.createTextNode(img.alt || ''));
  });
  return (clone.textContent || '').replace(/\u200B/g, '').trim().slice(0, 200);
}

function sendChatMessage() {
  let message = serializeChatInput();
  if (!message || !currentUsername) return;

  // Convert emoji shortcodes to unicode before sending
  if (window.emojione && typeof emojione.shortnameToUnicode === 'function') {
    message = emojione.shortnameToUnicode(message);
  }

  socket.emit('chat-message', {
    username: currentUsername,
    message: message,
    timestamp: Date.now(),
  });

  chatInput.innerHTML = '';
  chatInput.focus();
}

function displayChatMessage(data) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('chat-message');

  if (data.type === 'system') {
    messageDiv.classList.add('system');
    // Render emoji shortcodes in system messages too
    let msg = data.message;
    if (window.emojione && typeof emojione.shortnameToUnicode === 'function') {
      msg = emojione.shortnameToUnicode(msg);
    }
    if (window.renderCustomEmojis) msg = renderCustomEmojis(msg);
    messageDiv.innerHTML = `<span class="chat-text">${msg}</span>`;
  } else {
    messageDiv.classList.add('user');
    const timestamp = new Date(data.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    let msg = data.message;
    if (window.emojione && typeof emojione.shortnameToUnicode === 'function') {
      msg = emojione.shortnameToUnicode(msg);
    }
    if (window.renderCustomEmojis) msg = renderCustomEmojis(msg);
    messageDiv.innerHTML = `
      <span class="chat-username" style="color: ${getUsernameColor(
        data.username
      )}">${data.username}:</span>
      <span class="chat-text">${msg}</span>
      <span class="chat-timestamp">${timestamp}</span>
    `;
  }

  chatMessagesDiv.appendChild(messageDiv);
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

function getUsernameColor(username) {
  const colorIndex = getColorIndexForUserId(username);
  return userNameColors[colorIndex];
}

// --- Ping Measurement ---
function measurePing() {
  socket.emit('ping-from-client', { startTime: Date.now() });
}
socket.on('pong-to-client', (data) => {
  const rtt = Date.now() - data.startTime;
  socket.emit('report-my-ping', { ping: Math.round(rtt / 2) });
});

// --- WebRTC Logic ---
const peerConnectionConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};
async function createAndConfigurePeerConnection(targetSocketId) {
  console.log(
    `[WebRTC] Creating new PeerConnection for target: ${targetSocketId}`
  );
  const pc = new RTCPeerConnection(peerConnectionConfig);
  peerConnections[targetSocketId] = pc;
  pc.onicecandidate = (e) => {
    if (e.candidate)
      socket.emit('webrtc-ice-candidate', {
        target: targetSocketId,
        candidate: e.candidate,
      });
  };
  pc.ontrack = (event) => {
    console.log(`[WebRTC] Received remote audio track from ${targetSocketId}`);
    let audioEl = document.getElementById(`audio-${targetSocketId}`);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `audio-${targetSocketId}`;
      audioEl.autoplay = true;
      audioStreamsContainer.appendChild(audioEl);
    }
    audioEl.srcObject = event.streams[0];
    audioEl.volume = parseFloat(singerVolumeSlider.value); // Apply current singer volume setting
    if (personallyMutedSingers[targetSocketId]) audioEl.muted = true;
  };
  pc.oniceconnectionstatechange = () =>
    console.log(
      `[WebRTC Debug] ICE state for ${targetSocketId}: ${pc.iceConnectionState}`
    );
  pc.onconnectionstatechange = () =>
    console.log(
      `[WebRTC Debug] Connection state for ${targetSocketId}: ${pc.connectionState}`
    );
  return pc;
}
// Handle button load youtub manually
const loadYoutubeManuallyButton = document.getElementById('loadYoutubeManually');
loadYoutubeManuallyButton.addEventListener('click', () => {
  if (!isApiReady) {
    isApiReady = true;
    initializePlayer();
    loadYoutubeManuallyButton.style.display = 'none';
    showNotification('YouTube API loaded manually!', 'success');
  }
});

// --- YouTube Player Logic ---
function onYouTubeIframeAPIReady() {
  isApiReady = true;
  console.log('YouTube IFrame API is ready.');
}
function initializePlayer() {
  console.log('[DEBUG] Initializing YouTube Player...');

  if (!isApiReady || player) return;
  player = new YT.Player('player', {
    height: '360',
    width: '640',
    playerVars: {
      playsinline: 1,
      controls: isAdmin ? 1 : 0, // Admin gets controls, listeners do not
    },
    events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange },
  });
}
function onPlayerReady(event) {
  console.log('YouTube Player is ready.');
  if (!isAdmin && player && typeof player.setVolume === 'function') {
    player.setVolume(parseInt(youtubeVolumeSlider.value, 10));
  }
  if (queuedInitialState) {
    console.log('[DEBUG] Applying queued initial state:', queuedInitialState);
    currentSongDuration = queuedInitialState.totalDuration || 0; // Store duration for progress bar
    let playbackTime = queuedInitialState.timestamp;
    if (!isAdmin && queuedInitialState.videoId) {
      playbackTime = Math.max(
        0,
        queuedInitialState.timestamp - myCalculatedAudioDelayMs / 1000.0
      );
      console.log(
        `[DEBUG][Initial Sync] Admin time: ${queuedInitialState.timestamp.toFixed(
          2
        )}s, MyDelay: ${myCalculatedAudioDelayMs}ms, MyPlaybackTime: ${playbackTime.toFixed(
          2
        )}s`
      );
    }
    player.loadVideoById(queuedInitialState.videoId, playbackTime);
    if (queuedInitialState.isPlaying) {
      player.playVideo();
    } else {
      player.pauseVideo();
    }
    queuedInitialState = null;
  }
}
function onPlayerStateChange(event) {
  if (player && typeof player.getDuration === 'function') {
    currentSongDuration = player.getDuration();
  }

  if (isAdmin) {
    const videoData = player.getVideoData();
    const videoId = videoData ? videoData.video_id : null;
    const adminCurrentYouTubeTime = player.getCurrentTime();
    const duration = player.getDuration();

    switch (event.data) {
      case YT.PlayerState.PLAYING:
        socket.emit('PLAY', {
          currentTime: adminCurrentYouTubeTime,
          videoId: videoId,
          totalDuration: duration,
          adminActionTimestamp: performance.now(),
        });
        if (timeUpdater) clearInterval(timeUpdater);
        timeUpdater = setInterval(() => {
          const CAT = player.getCurrentTime();
          socket.emit('SYNC_TIME', { currentTime: CAT });
          if (localAudioStream) {
            socket.emit('admin-periodic-sync', {
              adminYouTubeTime: CAT,
              adminActionTimestamp: performance.now(),
              totalDuration: player.getDuration(), // Also send duration in periodic sync
            });
          }
        }, 2000);
        break;
      case YT.PlayerState.PAUSED:
        socket.emit('PAUSE', {
          currentTime: adminCurrentYouTubeTime,
          videoId: videoId,
          totalDuration: duration,
        });
        clearInterval(timeUpdater);
        break;
      case YT.PlayerState.ENDED:
        socket.emit('PAUSE', {
          currentTime: duration,
          videoId: videoId,
          totalDuration: duration,
        });
        clearInterval(timeUpdater);
        if (isAdmin) socket.emit('next-song');
        break;
    }
  } else {
    // Listener logic for their custom progress bar
    if (event.data === YT.PlayerState.PLAYING) {
      if (progressUpdaterInterval) clearInterval(progressUpdaterInterval);
      progressUpdaterInterval = setInterval(
        updateCustomProgressBarForListener,
        250
      );
    } else if (
      event.data === YT.PlayerState.PAUSED ||
      event.data === YT.PlayerState.ENDED
    ) {
      clearInterval(progressUpdaterInterval);
      if (player && typeof player.getCurrentTime === 'function') {
        // Update one last time on pause/end
        updateCustomProgressBarForListener();
      }
    }
  }
}

// --- Helper Functions ---
function getUsernameAndSave() {
  currentUsername = usernameInput.value.trim();
  if (!currentUsername) {
    showNotification('Please enter a username.', 'error');
    return null;
  }
  localStorage.setItem('karaokeUsername', currentUsername);
  return currentUsername;
}
function showKaraokeRoom(roomId) {
  sessionSetupDiv.classList.add('hidden');
  karaokeRoomDiv.classList.remove('hidden');
  sessionIdDisplay.textContent = roomId;

  if (isApiReady) {
    loadYoutubeManuallyButton.style.display = 'none';
  }
}
function renderPlaylist(playlist) {
  playlistDiv.innerHTML = '';
  if (playlist.length === 0) {
    playlistDiv.innerHTML = '<p>Playlist empty.</p>';
    if (player && typeof player.stopVideo === 'function') player.stopVideo();
    if (!isAdmin) customProgressBar.style.width = '0%'; // Reset listener progress bar
  } else {
    playlist.forEach((song, index) => {
      const iEl = document.createElement('div');
      iEl.classList.add('playlist-item');
      const mainDiv = document.createElement('div');
      mainDiv.classList.add('playlist-item-main');
      const tSpan = document.createElement('span');
      tSpan.classList.add('song-title');
      tSpan.textContent = `${index + 1}. ${song.title}`;
      mainDiv.appendChild(tSpan);

      const actionDiv = document.createElement('div');
      actionDiv.classList.add('playlist-item-actions');
      if (isAdmin) {
        // remove btn
        const b = document.createElement('button');
        b.textContent = '✖';
        b.classList.add('remove-btn');
        b.dataset.index = index;
        actionDiv.appendChild(b);

        // move-up btn
        const moveUpBtn = document.createElement('button');
        moveUpBtn.textContent = '⬆️';
        moveUpBtn.classList.add('move-up-btn');
        moveUpBtn.dataset.index = index;
        actionDiv.appendChild(moveUpBtn);

        // move-down btn
        const moveDownBtn = document.createElement('button');
        moveDownBtn.textContent = '⬇️';
        moveDownBtn.classList.add('move-down-btn');
        moveDownBtn.dataset.index = index;
        actionDiv.appendChild(moveDownBtn);

        // play-now-btn
        const playNowBtn = document.createElement('button');
        playNowBtn.textContent = '▶️';
        playNowBtn.classList.add('play-now-btn');
        playNowBtn.dataset.index = index;
        actionDiv.appendChild(playNowBtn);
      }
      mainDiv.appendChild(actionDiv);

      iEl.appendChild(mainDiv);
      if (song.addedBy) {
        const abSpan = document.createElement('span');
        abSpan.classList.add('added-by-text');
        abSpan.textContent = `Added by: ${song.addedBy}`;
        iEl.appendChild(abSpan);
      }
      playlistDiv.appendChild(iEl);
    });
    if (player && typeof player.getVideoData === 'function') {
      const cId = player.getVideoData().video_id || '';
      if (playlist[0] && cId !== playlist[0].id) {
        player.loadVideoById(playlist[0].id);
        player.pauseVideo();
      } else if (!playlist[0] && cId) {
        // Playlist just became empty but a video was loaded
        player.stopVideo();
        if (!isAdmin) customProgressBar.style.width = '0%';
      }
    }
  }
}
function renderSearchResults(results) {
  searchResultsDiv.innerHTML = '';
  results.forEach((s) => {
    const el = document.createElement('div');
    el.classList.add('song-item');
    el.innerHTML = `<img src="${s.thumbnail}" alt="thumb"><span>${s.title}</span><button class="add-btn">Add</button>`;
    el.querySelector('.add-btn').dataset.songId = s.id;
    el.querySelector('.add-btn').dataset.songTitle = s.title;
    searchResultsDiv.appendChild(el);
  });
}
function getColorIndexForUserId(userId) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h << 5) - h + userId.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % userNameColors.length;
}
function renderUserList(users) {
  userListUl.innerHTML = '';
  if (!users || users.length === 0) {
    userListUl.innerHTML = '<li>No users.</li>';
    return;
  }
  const currentAdminUser = users.find((u) => u.isAdminFlag);
  users.forEach((user) => {
    const li = document.createElement('li');
    const uiDiv = document.createElement('div');
    uiDiv.classList.add('user-info-display');
    let adminEmoji = user.isAdminFlag ? '👑 ' : '';
    const nameS = document.createElement('span');
    nameS.classList.add('user-name');
    nameS.style.color = userNameColors[getColorIndexForUserId(user.id)];
    nameS.textContent = user.username;
    const pingS = document.createElement('span');
    pingS.classList.add('ping-text');
    pingS.textContent = ` (${user.ping !== null ? user.ping + 'ms' : '...'})`;
    uiDiv.innerHTML = adminEmoji;
    uiDiv.appendChild(nameS);
    uiDiv.appendChild(pingS);
    if (user.id === socket.id) {
      const yS = document.createElement('span');
      yS.textContent = ' (You)';
      uiDiv.appendChild(yS);
    }
    li.appendChild(uiDiv);
    if (
      currentAdminUser &&
      currentAdminUser.id === user.id &&
      localAudioStream &&
      user.id !== socket.id &&
      currentAdminUser.id !== socket.id
    ) {
      const pMuteBtn = document.createElement('button');
      pMuteBtn.classList.add('personal-mute-btn');
      pMuteBtn.dataset.singerid = user.id;
      const aEl = document.getElementById(`audio-${user.id}`);
      if (personallyMutedSingers[user.id] || (aEl && aEl.muted)) {
        pMuteBtn.textContent = 'Unmute Singer';
        pMuteBtn.classList.add('muted');
      } else {
        pMuteBtn.textContent = 'Mute Singer';
        pMuteBtn.classList.remove('muted');
      }
      li.appendChild(pMuteBtn);
    }
    if (isAdmin && user.id !== socket.id) {
      const maBtn = document.createElement('button');
      maBtn.textContent = 'Make Admin';
      maBtn.classList.add('make-admin-btn');
      maBtn.dataset.userid = user.id;
      maBtn.dataset.username = user.username;
      li.appendChild(maBtn);
    }
    if (user.isAdminFlag) li.classList.add('admin-user-display');
    userListUl.appendChild(li);
  });
}

function updateCustomProgressBarForListener() {
  if (
    !isAdmin &&
    player &&
    typeof player.getCurrentTime === 'function' &&
    currentSongDuration > 0
  ) {
    const currentTime = player.getCurrentTime();
    const progressPercent = (currentTime / currentSongDuration) * 100;
    customProgressBar.style.width = `${Math.min(
      100,
      Math.max(0, progressPercent)
    )}%`;
  } else if (!isAdmin) {
    customProgressBar.style.width = '0%';
  }
}

// --- Event Listeners ---
createBtn.addEventListener('click', () => {
  const u = getUsernameAndSave();
  if (u) socket.emit('create-session', { username: u });
});
joinBtn.addEventListener('click', () => {
  const u = getUsernameAndSave();
  const r = roomIdInput.value.trim();
  if (u && r) socket.emit('join-session', { username: u, roomId: r });
  else if (!r) showNotification('Enter Session ID.', 'error');
});
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = searchInput.value;
  if (q) {
    socket.emit('search-song', q);
    searchInput.value = '';
  }
});
searchResultsDiv.addEventListener('click', (e) => {
  if (e.target.classList.contains('add-btn')) {
    const songD = {
      id: e.target.dataset.songId,
      title: e.target.dataset.songTitle,
    };
    socket.emit('add-song', { songData: songD });
    searchResultsDiv.innerHTML = '';
  }
});
playBtn.addEventListener('click', () => {
  if (isAdmin && player) player.playVideo();
});
pauseBtn.addEventListener('click', () => {
  if (isAdmin && player) player.pauseVideo();
});
nextSongBtn.addEventListener('click', () => {
  if (isAdmin) socket.emit('next-song');
});
playlistDiv.addEventListener('click', (e) => {
  const idx = parseInt(e.target.dataset.index, 10);
  if (isAdmin) {
    if (e.target.classList.contains('remove-btn')) {
      socket.emit('remove-song', { index: idx });
    }
    if (e.target.classList.contains('move-up-btn')) {
      socket.emit('move-song', { from: idx, to: idx - 1 });
    }
    if (e.target.classList.contains('move-down-btn')) {
      socket.emit('move-song', { from: idx, to: idx + 1 });
    }
    if (e.target.classList.contains('play-now-btn')) {
      socket.emit('play-now', { index: idx });
    }
  }
});
startSingingBtn.addEventListener('click', async () => {
  if (!isAdmin) return;
  try {
    localAudioStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    showNotification('Microphone activated!', 'success');
    startSingingBtn.classList.add('hidden');
    muteBtn.classList.remove('hidden');
    muteBtn.textContent = 'Mute';
    calibrateSyncBtn.classList.remove('hidden');
    renderUserList(roomUsers);
    for (const user of roomUsers) {
      if (user.id !== socket.id) {
        const pc = await createAndConfigurePeerConnection(user.id);
        localAudioStream
          .getTracks()
          .forEach((t) => pc.addTrack(t, localAudioStream));
        const o = await pc.createOffer();
        await pc.setLocalDescription(o);
        socket.emit('webrtc-offer', {
          target: user.id,
          offer: pc.localDescription,
        });
      }
    }
  } catch (e) {
    showNotification('Mic access denied.', 'error');
    console.error(e);
  }
});
muteBtn.addEventListener('click', () => {
  if (localAudioStream) {
    const t = localAudioStream.getAudioTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      muteBtn.textContent = t.enabled ? 'Mute' : 'Unmute';
      showNotification(`Your mic ${t.enabled ? 'unmuted' : 'muted'}.`, 'info');
    }
  }
});
calibrateSyncBtn.addEventListener('click', () => {
  if (
    isAdmin &&
    player &&
    typeof player.getCurrentTime === 'function' &&
    (player.getPlayerState() === YT.PlayerState.PLAYING ||
      player.getPlayerState() === YT.PlayerState.PAUSED)
  ) {
    socket.emit('initiate-hard-recalibration', {
      adminPlayerTimeAtCalibration: player.getCurrentTime(),
    });
    showNotification('Recalibration signal sent!', 'info');
  } else if (isAdmin) {
    showNotification('Play/pause song before calibrating.', 'error');
  }
});
userListUl.addEventListener('click', (e) => {
  if (e.target.classList.contains('make-admin-btn')) {
    if (isAdmin) {
      const uid = e.target.dataset.userid;
      const uname = e.target.dataset.username;
      if (confirm(`Make ${uname} admin?`))
        socket.emit('assign-admin', { newAdminUserId: uid });
    }
  } else if (e.target.classList.contains('personal-mute-btn')) {
    const singerId = e.target.dataset.singerid;
    const audioEl = document.getElementById(`audio-${singerId}`);
    if (audioEl) {
      audioEl.muted = !audioEl.muted;
      personallyMutedSingers[singerId] = audioEl.muted;
      e.target.textContent = audioEl.muted ? 'Unmute Singer' : 'Mute Singer';
      e.target.classList.toggle('muted', audioEl.muted);
      showNotification(
        `Singer ${audioEl.muted ? 'muted' : 'unmuted'} for you.`,
        'info'
      );
    }
  }
});
youtubeVolumeSlider.addEventListener('input', (e) => {
  if (player && typeof player.setVolume === 'function') {
    player.setVolume(parseInt(e.target.value, 10));
  }
});
singerVolumeSlider.addEventListener('input', (e) => {
  const singerAudioElements = audioStreamsContainer.querySelectorAll('audio');
  const newVolume = parseFloat(e.target.value);
  singerAudioElements.forEach((audioEl) => {
    audioEl.volume = newVolume;
  });
});
sendChatBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    const isDropdownVisible = emojiResults.style.display === 'block';
    if (!isDropdownVisible) {
      e.preventDefault();
      sendChatMessage();
    }
  }
});

// --- Socket Event Handlers ---
socket.on('connect', () => {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(measurePing, 5000);
});
socket.on('session-created', (data) => {
  isAdmin = data.isAdmin;
  roomUsers = data.users;
  myCalculatedAudioDelayMs = 200;
  showKaraokeRoom(data.roomId);
  initializePlayer();
  renderUserList(data.users);
  if (isAdmin) {
    controlsContainer.classList.remove('hidden');
    calibrateSyncBtn.classList.remove('hidden');
    // listenerVolumeControlsDiv.classList.add('hidden');
    listenerVolumeControlsDiv.classList.remove('hidden');
    document.querySelector('.volume-slider-container.singer').classList.add('hidden');
    customProgressBarContainer.classList.add('hidden');
  } else {
    calibrateSyncBtn.classList.add('hidden');
    listenerVolumeControlsDiv.classList.remove('hidden');
    document.querySelector('.volume-slider-container.singer').classList.remove('hidden');
    customProgressBarContainer.classList.remove('hidden');
  }
  if (data.assignedUsername) {
    usernameInput.value = data.assignedUsername;
    currentUsername = data.assignedUsername;
    localStorage.setItem('karaokeUsername', data.assignedUsername);
  } else {
    currentUsername = usernameInput.value.trim();
  }
});
socket.on('session-joined', (data) => {
  isAdmin = data.isAdmin;
  roomUsers = data.users;
  myCalculatedAudioDelayMs = 200;
  showKaraokeRoom(data.roomId);
  initializePlayer();
  renderPlaylist(data.playlist);
  renderUserList(data.users);
  if (data.currentVideoId) {
    queuedInitialState = {
      videoId: data.currentVideoId,
      timestamp: data.timestamp,
      isPlaying: data.isPlaying,
      totalDuration: data.totalDuration,
    };
    if (!isAdmin && data.totalDuration)
      currentSongDuration = data.totalDuration;
  }
  if (isAdmin) {
    controlsContainer.classList.remove('hidden');
    calibrateSyncBtn.classList.remove('hidden');
    listenerVolumeControlsDiv.classList.add('hidden');
    customProgressBarContainer.classList.add('hidden');
  } else {
    calibrateSyncBtn.classList.add('hidden');
    listenerVolumeControlsDiv.classList.remove('hidden');
    customProgressBarContainer.classList.remove('hidden');
  }
  if (data.assignedUsername) {
    usernameInput.value = data.assignedUsername;
    currentUsername = data.assignedUsername;
    localStorage.setItem('karaokeUsername', data.assignedUsername);
  } else {
    currentUsername = usernameInput.value.trim();
  }
});
socket.on('update-user-list', (users) => {
  const oldUserIds = new Set(roomUsers.map((u) => u.id));
  roomUsers = users;
  renderUserList(users);
  if (isAdmin && localAudioStream) {
    for (const u of users) {
      if (
        u.id !== socket.id &&
        !oldUserIds.has(u.id) &&
        !peerConnections[u.id]
      ) {
        createAndConfigurePeerConnection(u.id)
          .then((pc) => {
            localAudioStream
              .getTracks()
              .forEach((t) => pc.addTrack(t, localAudioStream));
            pc.createOffer()
              .then((o) => pc.setLocalDescription(o))
              .then(() =>
                socket.emit('webrtc-offer', {
                  target: u.id,
                  offer: pc.localDescription,
                })
              )
              .catch((e) => console.error(e));
          })
          .catch((e) => console.error(e));
      }
    }
  }
});
socket.on('user-left', (user) => {
  showNotification(`${user.username} left.`, 'info');
  if (peerConnections[user.id]) {
    peerConnections[user.id].close();
    delete peerConnections[user.id];
  }
  const a = document.getElementById(`audio-${user.id}`);
  if (a) a.remove();
});
socket.on('user-left-webrtc-cleanup', (data) => {
  if (peerConnections[data.socketId]) {
    peerConnections[data.socketId].close();
    delete peerConnections[data.socketId];
  }
  const a = document.getElementById(`audio-${data.socketId}`);
  if (a) a.remove();
});
socket.on('you-are-now-admin', () => {
  showNotification('You are new admin!', 'success');
  isAdmin = true;
  controlsContainer.classList.remove('hidden');
  calibrateSyncBtn.classList.remove('hidden');
  listenerVolumeControlsDiv.classList.add('hidden');
  customProgressBarContainer.classList.add('hidden'); // Hide listener stuff
  renderUserList(roomUsers);
  renderPlaylist(JSON.parse(playlistDiv.dataset.playlistdata || '[]'));
  startSingingBtn.classList.remove('hidden');
  muteBtn.classList.add('hidden');
  localAudioStream = null;
  for (const p in peerConnections) {
    peerConnections[p].close();
    delete peerConnections[p];
  }
});
socket.on('admin-rights-removed', () => {
  showNotification('No longer admin.', 'info');
  isAdmin = false;
  controlsContainer.classList.add('hidden');
  calibrateSyncBtn.classList.add('hidden');
  listenerVolumeControlsDiv.classList.remove('hidden');
  customProgressBarContainer.classList.remove('hidden'); // Show listener stuff
  startSingingBtn.classList.add('hidden');
  muteBtn.classList.add('hidden');
  if (localAudioStream) {
    localAudioStream.getTracks().forEach((t) => t.stop());
    localAudioStream = null;
    for (const p in peerConnections) {
      if (peerConnections[p]) peerConnections[p].close();
    }
    Object.keys(peerConnections).forEach((k) => delete peerConnections[k]);
  }
  renderUserList(roomUsers);
  renderPlaylist(JSON.parse(playlistDiv.dataset.playlistdata || '[]'));
});
socket.on('error', (msg) => showNotification(msg, 'error'));
socket.on('chat-message', displayChatMessage);
socket.on('search-results', (r) => renderSearchResults(r));
socket.on('update-playlist', (p) => {
  playlistDiv.dataset.playlistdata = JSON.stringify(p);
  renderPlaylist(p);
});
socket.on('listeners-pause-for-recalibration', () => {
  if (!isAdmin && player) {
    player.pauseVideo();
    showNotification('Re-synchronizing...', 'info', 1500);
  }
});
socket.on('listeners-execute-recalibration', (data) => {
  if (!isAdmin && player && typeof player.getCurrentTime === 'function') {
    const listenerPlayerTimeNow = player.getCurrentTime();
    const offsetInSeconds =
      listenerPlayerTimeNow - data.adminPlayerTimeAtCalibration;
    myCalculatedAudioDelayMs = Math.max(
      0,
      Math.min(2000, offsetInSeconds * 1000)
    );
    let targetTime =
      data.adminPlayerTimeAtCalibration - myCalculatedAudioDelayMs / 1000.0;
    targetTime = Math.max(0, targetTime);
    player.seekTo(targetTime, true);
    player.playVideo();
  }
});
socket.on('continuous-sync-signal', (data) => {
  if (!isAdmin && player && typeof player.getCurrentTime === 'function') {
    // Apply if player is ready, regardless of playing state
    if (data.totalDuration) currentSongDuration = data.totalDuration;
    if (player.getPlayerState() === YT.PlayerState.PLAYING) {
      // Only adjust delay if actively playing
      const listenerReceiptTime = performance.now();
      const signalTravelTimeMs =
        listenerReceiptTime - data.adminActionTimestamp;
      const adminEffectiveYouTubeTime =
        data.adminYouTubeTime + signalTravelTimeMs / 1000.0;
      const listenerCurrentYouTubeTime = player.getCurrentTime();
      const currentOffsetSeconds =
        listenerCurrentYouTubeTime - adminEffectiveYouTubeTime;
      const targetDelayMsIfCorrected =
        myCalculatedAudioDelayMs + currentOffsetSeconds * 1000.0;
      const SMOOTHING_FACTOR = 0.03;
      let newCalculatedDelayMs =
        myCalculatedAudioDelayMs * (1 - SMOOTHING_FACTOR) +
        targetDelayMsIfCorrected * SMOOTHING_FACTOR;
      newCalculatedDelayMs = Math.max(0, Math.min(2000, newCalculatedDelayMs));
      if (Math.abs(newCalculatedDelayMs - myCalculatedAudioDelayMs) > 10) {
        myCalculatedAudioDelayMs = newCalculatedDelayMs;
      }
    }
  }
});
socket.on('PLAY', (data) => {
  if (player) {
    if (data.totalDuration) currentSongDuration = data.totalDuration;
    let playbackTime = data.currentTime;
    if (!isAdmin) {
      playbackTime = Math.max(
        0,
        data.currentTime - myCalculatedAudioDelayMs / 1000.0
      );
    }

    if (player.getVideoData()) {
      if (player.getVideoData().video_id !== data.videoId && data.videoId)
        player.loadVideoById(data.videoId, playbackTime);
      else player.seekTo(playbackTime, true);
    }

    player.playVideo();
  }
});
socket.on('PAUSE', (data) => {
  if (player) {
    if (data.totalDuration) currentSongDuration = data.totalDuration; // Keep duration updated
    let pauseTime = data.currentTime;
    if (!isAdmin) {
      pauseTime = Math.max(
        0,
        data.currentTime - myCalculatedAudioDelayMs / 1000.0
      );
    }
    player.pauseVideo();
    player.seekTo(pauseTime, true);
  }
});
socket.on('UPDATE_TIME', (data) => {}); // This event name is not used currently by server
socket.on('webrtc-offer', async (d) => {
  const pc = await createAndConfigurePeerConnection(d.from);
  await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
  const a = await pc.createAnswer();
  await pc.setLocalDescription(a);
  socket.emit('webrtc-answer', { target: d.from, answer: pc.localDescription });
});
socket.on('webrtc-answer', async (d) => {
  const pc = peerConnections[d.from];
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
});
socket.on('webrtc-ice-candidate', async (d) => {
  const pc = peerConnections[d.from];
  if (pc && d.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(d.candidate));
    } catch (e) {
      console.error('ICE Error', e);
    }
  }
});
// socket.on('chat-message', (data) => {
//   const messageEl = document.createElement('div');
//   messageEl.classList.add('chat-message');
//   messageEl.innerHTML = `<strong>${data.username}:</strong> ${data.content}`;
//   chatMessagesDiv.appendChild(messageEl);
//   chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight; // Auto-scroll to bottom
// });

// --- Dark Mode Toggle ---
const darkModeToggle = document.getElementById('dark-mode-toggle');
if (darkModeToggle) {
  // Load preference
  if (localStorage.getItem('darkMode') === 'enabled') {
    document.body.classList.add('dark-mode');
    darkModeToggle.textContent = '☀️ Light Mode';
  }
  darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const enabled = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', enabled ? 'enabled' : 'disabled');
    darkModeToggle.textContent = enabled ? '☀️ Light Mode' : '🌙 Dark Mode';
  });
}

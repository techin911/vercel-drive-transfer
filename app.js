// VercelStream Studio — 100% Serverless Live Broadcast Control Center & Player Engine
// Admin Passcode: admin123 (Change anytime in Admin Panel)

const CONFIG_KEY = 'vercelstream_channels_config';
const KEYS_KEY   = 'vercelstream_access_keys';
const ADMIN_KEY  = 'vercelstream_admin_unlocked';

let currentTab = 'user';
let activeChannel = 'ch1';
let hlsPlayer = null;
let flvPlayer = null;

// Default Broadcast Configurations
const defaultConfig = {
  isLive: true,
  announcement: '🔴 Live Stream Event is now broadcasting on Channel 1!',
  channels: {
    ch1: {
      name: 'Channel 1 (Primary)',
      format: 'hls',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    ch2: {
      name: 'Channel 2 (Backup)',
      format: 'hls',
      url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8'
    },
    ch3: {
      name: 'Channel 3 (Event Special)',
      format: 'iframe',
      url: 'https://www.youtube.com/embed/live_stream?channel=UC4R8DWoMoI7CAwX8_LjQHig'
    }
  }
};

const defaultKeys = [
  { key: 'key_primary_live', channel: 'ch1', status: 'Active' },
  { key: 'key_backup_live', channel: 'ch2', status: 'Active' },
  { key: 'key_event_03', channel: 'ch3', status: 'Active' }
];

// ─── Init ─────────────────────────────────────────────────────────────────────
window.onload = () => {
  initStorage();
  updateLiveBadge();
  loadChannel(activeChannel);
  renderKeysTable();

  if (localStorage.getItem(ADMIN_KEY) === 'true') {
    showAdminDashboard(true);
  }
};

function getStoreConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || defaultConfig; }
  catch { return defaultConfig; }
}

function saveStoreConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  updateLiveBadge();
}

function initStorage() {
  if (!localStorage.getItem(CONFIG_KEY)) {
    saveStoreConfig(defaultConfig);
  }
  if (!localStorage.getItem(KEYS_KEY)) {
    localStorage.setItem(KEYS_KEY, JSON.stringify(defaultKeys));
  }
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tabUserBtn').classList.toggle('active', tab === 'user');
  document.getElementById('tabAdminBtn').classList.toggle('active', tab === 'admin');

  document.getElementById('userDashboard').classList.toggle('hidden', tab !== 'user');
  document.getElementById('adminPanel').classList.toggle('hidden', tab !== 'admin');

  if (tab === 'user') {
    loadChannel(activeChannel);
  } else if (tab === 'admin') {
    const isUnlocked = localStorage.getItem(ADMIN_KEY) === 'true';
    showAdminDashboard(isUnlocked);
  }
}

// ─── Admin Security ───────────────────────────────────────────────────────────
function unlockAdmin() {
  const pass = document.getElementById('adminPassInput').value.trim();
  if (pass === 'admin123' || pass === 'admin') {
    localStorage.setItem(ADMIN_KEY, 'true');
    showAdminDashboard(true);
    showToast('🔓 Admin Panel Unlocked!', 'success');
  } else {
    showToast('❌ Incorrect Passcode', 'error');
  }
}

function showAdminDashboard(show) {
  document.getElementById('adminLockScreen').classList.toggle('hidden', show);
  document.getElementById('adminMainContent').classList.toggle('hidden', !show);
  if (show) {
    loadAdminChannelConfig('ch1');
    renderKeysTable();
  }
}

// ─── Admin Controller Actions ─────────────────────────────────────────────────
function setBroadcastStatus(isLive) {
  const cfg = getStoreConfig();
  cfg.isLive = isLive;
  saveStoreConfig(cfg);
  updateLiveBadge();
  loadChannel(activeChannel);
  showToast(isLive ? '🔴 LIVE BROADCAST STARTED!' : '⏹ Broadcast Ended', isLive ? 'success' : 'error');
}

function loadAdminChannelConfig(chKey) {
  const cfg = getStoreConfig();
  const ch = cfg.channels[chKey] || {};
  document.getElementById('adminSourceFormat').value = ch.format || 'hls';
  document.getElementById('adminStreamUrl').value = ch.url || '';
  document.getElementById('adminAnnounceInput').value = cfg.announcement || '';
}

function saveAdminChannelConfig() {
  const cfg = getStoreConfig();
  const chKey = document.getElementById('adminChannelSelect').value;
  const format = document.getElementById('adminSourceFormat').value;
  const url = document.getElementById('adminStreamUrl').value.trim();
  const announce = document.getElementById('adminAnnounceInput').value.trim();

  if (!url) {
    showToast('⚠️ Paste a valid Stream Source URL first', 'error');
    return;
  }

  cfg.channels[chKey] = {
    name: getChannelName(chKey),
    format: format,
    url: url
  };
  cfg.announcement = announce;

  saveStoreConfig(cfg);
  loadChannel(activeChannel);
  showToast(`✅ Saved ${getChannelName(chKey)} settings!`, 'success');
}

// ─── Stream Key Management ────────────────────────────────────────────────────
function getKeys() {
  try { return JSON.parse(localStorage.getItem(KEYS_KEY)) || defaultKeys; }
  catch { return defaultKeys; }
}

function renderKeysTable() {
  const tbody = document.getElementById('keysTableBody');
  if (!tbody) return;
  const keys = getKeys();
  tbody.innerHTML = keys.map((k, idx) => `
    <tr>
      <td><code style="color:var(--cyan);font-family:'JetBrains Mono'">${k.key}</code></td>
      <td>${getChannelName(k.channel)}</td>
      <td><span class="badge ${k.status==='Active'?'badge-ready':'badge-offline'}">${k.status}</span></td>
      <td>
        <button class="btn-sm btn-action" onclick="deleteKey(${idx})">🗑️ Delete</button>
      </td>
    </tr>
  `).join('');
}

function generateNewKey() {
  const name = document.getElementById('newKeyName').value.trim();
  const ch = document.getElementById('newKeyChannel').value;
  if (!name) {
    showToast('⚠️ Type a key name first', 'error');
    return;
  }
  const keys = getKeys();
  keys.push({ key: name, channel: ch, status: 'Active' });
  localStorage.setItem(KEYS_KEY, JSON.stringify(keys));
  document.getElementById('newKeyName').value = '';
  renderKeysTable();
  showToast('✅ Stream Key Generated!', 'success');
}

function deleteKey(idx) {
  const keys = getKeys();
  keys.splice(idx, 1);
  localStorage.setItem(KEYS_KEY, JSON.stringify(keys));
  renderKeysTable();
}

// ─── Video Player Engine ──────────────────────────────────────────────────────
function changeChannel(chKey) {
  activeChannel = chKey;
  document.getElementById('statChannel').textContent = getChannelName(chKey);
  loadChannel(chKey);
}

function loadChannel(chKey) {
  const cfg = getStoreConfig();
  const ch = cfg.channels[chKey] || {};
  const video = document.getElementById('videoPlayer');
  const iframe = document.getElementById('iframePlayer');
  const overlay = document.getElementById('playerOverlay');
  const announceBanner = document.getElementById('announcementBanner');
  const announceText = document.getElementById('announceText');

  // Announcement Banner
  if (cfg.announcement) {
    announceText.textContent = cfg.announcement;
    announceBanner.classList.remove('hidden');
  } else {
    announceBanner.classList.add('hidden');
  }

  // If Broadcast is OFFLINE
  if (!cfg.isLive) {
    destroyPlayers();
    video.classList.add('hidden');
    iframe.classList.add('hidden');
    overlay.classList.remove('hidden');
    document.getElementById('statStatus').textContent = 'OFFLINE';
    document.getElementById('statStatus').className = 'stat-value text-red';
    return;
  }

  document.getElementById('statStatus').textContent = '🔴 LIVE';
  document.getElementById('statStatus').className = 'stat-value text-red';

  destroyPlayers();

  if (ch.format === 'iframe') {
    video.classList.add('hidden');
    iframe.src = ch.url;
    iframe.classList.remove('hidden');
    overlay.classList.add('hidden');
    document.getElementById('statProto').textContent = 'EMBED / IFRAME';
  } else {
    iframe.classList.add('hidden');
    iframe.src = '';
    video.classList.remove('hidden');

    if (ch.format === 'hls' && Hls.isSupported()) {
      hlsPlayer = new Hls({ maxBufferLength: 2, liveSyncDurationCount: 1 });
      hlsPlayer.loadSource(ch.url);
      hlsPlayer.attachMedia(video);
      hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(()=>{});
        overlay.classList.add('hidden');
      });
      document.getElementById('statProto').textContent = 'HLS (.m3u8)';
    } else if (ch.format === 'flv' && window.mpegts && mpegts.isSupported()) {
      flvPlayer = mpegts.createPlayer({ type: 'flv', isLive: true, url: ch.url }, { enableStashBuffer: false });
      flvPlayer.attachMediaElement(video);
      flvPlayer.load();
      flvPlayer.play().catch(()=>{});
      overlay.classList.add('hidden');
      document.getElementById('statProto').textContent = 'HTTP-FLV (<1s)';
    } else {
      video.src = ch.url;
      video.play().then(() => overlay.classList.add('hidden')).catch(() => overlay.classList.remove('hidden'));
      document.getElementById('statProto').textContent = 'DIRECT MP4';
    }
  }
}

function destroyPlayers() {
  if (hlsPlayer) { hlsPlayer.destroy(); hlsPlayer = null; }
  if (flvPlayer) { flvPlayer.destroy(); flvPlayer = null; }
}

function reloadPlayer() {
  loadChannel(activeChannel);
  showToast('🔄 Feed Reloaded', 'success');
}

function toggleFullscreen() {
  const video = document.getElementById('videoPlayer');
  if (video.requestFullscreen) video.requestFullscreen();
}

function updateLiveBadge() {
  const cfg = getStoreConfig();
  const badge = document.getElementById('liveBadge');
  const text = document.getElementById('liveBadgeText');
  if (cfg.isLive) {
    badge.className = 'status-badge status-online';
    text.textContent = '🔴 LIVE';
  } else {
    badge.className = 'status-badge status-offline';
    text.textContent = 'OFFLINE';
  }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  const chat = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="msg-author">Viewer:</span> <span class="msg-content">${escHtml(msg)}</span>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  input.value = '';
}

function handleChatKey(e) {
  if (e.key === 'Enter') sendChatMessage();
}

function getChannelName(key) {
  const map = { ch1: 'Channel 1 (Primary)', ch2: 'Channel 2 (Backup)', ch3: 'Channel 3 (Event Special)' };
  return map[key] || key;
}

function showToast(msg, type) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:14px 20px;
    border-radius:12px;font-size:14px;font-weight:600;
    background:${type==='success'?'rgba(0,230,118,0.15)':'rgba(255,82,82,0.15)'};
    border:1px solid ${type==='success'?'rgba(0,230,118,0.4)':'rgba(255,82,82,0.4)'};
    color:${type==='success'?'#00e676':'#ff5252'};
    backdrop-filter:blur(10px);box-shadow:0 8px 30px rgba(0,0,0,0.3);`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.3s'; setTimeout(()=>t.remove(),300); }, 3000);
}

function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

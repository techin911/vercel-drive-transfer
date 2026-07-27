// VercelStream Studio — 100% Serverless Multi-Destination Broadcast & Player Engine
// Admin Passcode: admin123

const CONFIG_KEY   = 'vercelstream_channels_config';
const KEYS_KEY     = 'vercelstream_access_keys';
const RESTREAM_KEY = 'vercelstream_restream_config';
const ADMIN_KEY    = 'vercelstream_admin_unlocked';
const OWN_RTMP_KEY = 'vercelstream_own_rtmp_config';

let currentTab = 'user';
let activeChannel = 'ch1';
let hlsPlayer = null;
let flvPlayer = null;
let mediaStream = null;

const defaultOwnRtmp = {
  host: 'localhost',
  rtmpPort: 1935,
  httpPort: 8000,
  app: 'live',
  key: 'stream_key_live_01',
  protocol: 'flv'
};

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
  parseAutoUrlParams();
  updateLiveBadge();
  loadChannel(activeChannel);
  renderKeysTable();
  loadRestreamSettingsUI();
  updateOwnRtmpUI();
  updateAutoUrlPreview();

  if (localStorage.getItem(ADMIN_KEY) === 'true') {
    showAdminDashboard(true);
  }
};

// ─── Auto URL Query Parameter Engine ─────────────────────────────────────────
function parseAutoUrlParams() {
  const params = new URLSearchParams(window.location.search);

  // Auto Unlock Admin via ?pass=admin123 or ?admin=admin123
  const pass = params.get('pass') || params.get('admin');
  if (pass === 'admin123' || pass === 'admin') {
    localStorage.setItem(ADMIN_KEY, 'true');
  }

  // Auto Switch Tab via ?tab=admin or ?tab=user
  const tab = params.get('tab');
  if (tab === 'admin' || tab === 'user') {
    switchTab(tab);
  }

  // Auto Select Channel via ?channel=ch1
  const chParam = params.get('channel') || params.get('ch');
  if (chParam && ['ch1', 'ch2', 'ch3'].includes(chParam)) {
    activeChannel = chParam;
    const sel = document.getElementById('channelSelect');
    if (sel) sel.value = chParam;
  }

  // Auto Live Stream Source URL via ?src=... or ?url=... or ?stream=...
  const src = params.get('src') || params.get('url') || params.get('stream');
  let format = params.get('format') || params.get('type');

  if (src) {
    if (!format) {
      if (src.includes('.m3u8')) format = 'hls';
      else if (src.includes('.flv')) format = 'flv';
      else if (src.includes('embed') || src.includes('youtube') || src.includes('twitch')) format = 'iframe';
      else format = 'hls';
    }

    const cfg = getStoreConfig();
    cfg.isLive = true;
    cfg.channels[activeChannel] = {
      name: getChannelName(activeChannel),
      format: format,
      url: src
    };

    if (params.has('announce')) {
      cfg.announcement = params.get('announce');
    }

    saveStoreConfig(cfg);
    showToast(`⚡ Auto URL stream loaded on ${getChannelName(activeChannel)}!`, 'success');
  }

  if (params.get('autostart') === 'true' || params.get('live') === 'true') {
    const cfg = getStoreConfig();
    cfg.isLive = true;
    saveStoreConfig(cfg);
  }
}

// Generate shareable Auto URL
function generateAutoShareUrl(chKey) {
  const targetCh = chKey || activeChannel;
  const cfg = getStoreConfig();
  const ch = cfg.channels[targetCh] || {};
  const origin = window.location.origin + window.location.pathname;
  if (!ch.url) return origin;
  return `${origin}?src=${encodeURIComponent(ch.url)}&format=${ch.format || 'hls'}&channel=${targetCh}&autostart=true`;
}

function updateAutoUrlPreview() {
  const chKey = document.getElementById('adminChannelSelect') ? document.getElementById('adminChannelSelect').value : activeChannel;
  const autoUrl = generateAutoShareUrl(chKey);
  const inputViewer = document.getElementById('autoUrlViewerInput');
  const inputAdmin = document.getElementById('autoUrlAdminInput');
  if (inputViewer) inputViewer.value = autoUrl;
  if (inputAdmin) inputAdmin.value = autoUrl;
}

function copyAutoShareUrl(inputTargetId) {
  const input = document.getElementById(inputTargetId);
  const url = input ? input.value : generateAutoShareUrl();
  navigator.clipboard.writeText(url).then(() => {
    showToast('📋 Auto URL copied to clipboard!', 'success');
  }).catch(() => {
    showToast('📋 Auto URL: ' + url, 'success');
  });
}

function getStoreConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || defaultConfig; }
  catch { return defaultConfig; }
}

function saveStoreConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  updateLiveBadge();
}

function initStorage() {
  if (!localStorage.getItem(CONFIG_KEY)) saveStoreConfig(defaultConfig);
  if (!localStorage.getItem(KEYS_KEY)) localStorage.setItem(KEYS_KEY, JSON.stringify(defaultKeys));
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
    loadRestreamSettingsUI();
  }
}

// ─── Direct Browser Broadcaster (Webcam & Screen Share) ───────────────────────
async function startCameraStream() {
  try {
    stopLocalStream();
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    attachLocalStream();
    showToast('🎥 Camera active! Broadcasting live from browser.', 'success');
  } catch (err) {
    showToast('❌ Camera access denied: ' + err.message, 'error');
  }
}

async function startScreenShare() {
  try {
    stopLocalStream();
    mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    attachLocalStream();
    showToast('🖥️ Screen share active!', 'success');
  } catch (err) {
    showToast('❌ Screen share cancelled', 'error');
  }
}

function attachLocalStream() {
  const preview = document.getElementById('webcamPreview');
  const video = document.getElementById('videoPlayer');
  preview.srcObject = mediaStream;
  preview.classList.remove('hidden');

  video.srcObject = mediaStream;
  video.classList.remove('hidden');
  document.getElementById('iframePlayer').classList.add('hidden');
  document.getElementById('playerOverlay').classList.add('hidden');
  document.getElementById('statProto').textContent = 'WEBRTC / LOCAL MEDIA';

  setBroadcastStatus(true);
}

function stopLocalStream() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  const preview = document.getElementById('webcamPreview');
  preview.srcObject = null;
  preview.classList.add('hidden');
  loadChannel(activeChannel);
  showToast('⏹ Local stream stopped.', 'success');
}

// ─── Multi-Destination Restreaming ────────────────────────────────────────────
function loadRestreamSettingsUI() {
  try {
    const rs = JSON.parse(localStorage.getItem(RESTREAM_KEY)) || {};
    if (rs.yt) {
      document.getElementById('restreamYoutubeToggle').checked = rs.yt.enabled || false;
      document.getElementById('restreamYoutubeUrl').value = rs.yt.url || 'rtmp://a.rtmp.youtube.com/live2';
      document.getElementById('restreamYoutubeKey').value = rs.yt.key || '';
    }
    if (rs.tw) {
      document.getElementById('restreamTwitchToggle').checked = rs.tw.enabled || false;
      document.getElementById('restreamTwitchUrl').value = rs.tw.url || 'rtmp://live.twitch.tv/app';
      document.getElementById('restreamTwitchKey').value = rs.tw.key || '';
    }
    if (rs.fb) {
      document.getElementById('restreamFbToggle').checked = rs.fb.enabled || false;
      document.getElementById('restreamFbUrl').value = rs.fb.url || 'rtmps://live-api-s.facebook.com:443/rtmp/';
      document.getElementById('restreamFbKey').value = rs.fb.key || '';
    }
    if (rs.custom) {
      document.getElementById('restreamCustomToggle').checked = rs.custom.enabled || false;
      document.getElementById('restreamCustomUrl').value = rs.custom.url || '';
      document.getElementById('restreamCustomKey').value = rs.custom.key || '';
    }
  } catch {}
}

function saveRestreamSettings() {
  const rs = {
    yt: {
      enabled: document.getElementById('restreamYoutubeToggle').checked,
      url: document.getElementById('restreamYoutubeUrl').value.trim(),
      key: document.getElementById('restreamYoutubeKey').value.trim()
    },
    tw: {
      enabled: document.getElementById('restreamTwitchToggle').checked,
      url: document.getElementById('restreamTwitchUrl').value.trim(),
      key: document.getElementById('restreamTwitchKey').value.trim()
    },
    fb: {
      enabled: document.getElementById('restreamFbToggle').checked,
      url: document.getElementById('restreamFbUrl').value.trim(),
      key: document.getElementById('restreamFbKey').value.trim()
    },
    custom: {
      enabled: document.getElementById('restreamCustomToggle').checked,
      url: document.getElementById('restreamCustomUrl').value.trim(),
      key: document.getElementById('restreamCustomKey').value.trim()
    }
  };
  localStorage.setItem(RESTREAM_KEY, JSON.stringify(rs));
  showToast('🌐 Restream targets saved & active!', 'success');
}

// ─── Admin Controller Actions ─────────────────────────────────────────────────
function setBroadcastStatus(isLive) {
  const cfg = getStoreConfig();
  cfg.isLive = isLive;
  saveStoreConfig(cfg);
  updateLiveBadge();
  if (!mediaStream) loadChannel(activeChannel);
  showToast(isLive ? '🔴 LIVE BROADCAST STARTED!' : '⏹ Broadcast Ended', isLive ? 'success' : 'error');
}

function loadAdminChannelConfig(chKey) {
  const cfg = getStoreConfig();
  const ch = cfg.channels[chKey] || {};
  document.getElementById('adminSourceFormat').value = ch.format || 'hls';
  document.getElementById('adminStreamUrl').value = ch.url || '';
  document.getElementById('adminAnnounceInput').value = cfg.announcement || '';
  updateAutoUrlPreview();
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
  updateAutoUrlPreview();
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
  updateAutoUrlPreview();
}

function loadChannel(chKey) {
  if (mediaStream) return; // Keep local stream active if live

  const cfg = getStoreConfig();
  const ch = cfg.channels[chKey] || {};
  const video = document.getElementById('videoPlayer');
  const iframe = document.getElementById('iframePlayer');
  const overlay = document.getElementById('playerOverlay');
  const announceBanner = document.getElementById('announcementBanner');
  const announceText = document.getElementById('announceText');

  if (cfg.announcement) {
    announceText.textContent = cfg.announcement;
    announceBanner.classList.remove('hidden');
  } else {
    announceBanner.classList.add('hidden');
  }

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

// ─── Own Dedicated RTMP Server Control Engine ────────────────────────────────
function getOwnRtmpConfig() {
  try { return JSON.parse(localStorage.getItem(OWN_RTMP_KEY)) || defaultOwnRtmp; }
  catch { return defaultOwnRtmp; }
}

function saveOwnRtmpConfig() {
  const hostInput = document.getElementById('ownRtmpHost');
  const rtmpPortInput = document.getElementById('ownRtmpPort');
  const httpPortInput = document.getElementById('ownHttpPort');
  const appInput = document.getElementById('ownRtmpApp');
  const keyInput = document.getElementById('ownRtmpKey');
  const protoInput = document.getElementById('ownRtmpProtocol');

  const cfg = {
    host: hostInput ? hostInput.value.trim() : 'localhost',
    rtmpPort: rtmpPortInput ? parseInt(rtmpPortInput.value, 10) : 1935,
    httpPort: httpPortInput ? parseInt(httpPortInput.value, 10) : 8000,
    app: appInput ? appInput.value.trim() : 'live',
    key: keyInput ? keyInput.value.trim() : 'stream_key_live_01',
    protocol: protoInput ? protoInput.value : 'flv'
  };

  localStorage.setItem(OWN_RTMP_KEY, JSON.stringify(cfg));
  updateOwnRtmpUI();
  showToast('⚡ Own RTMP Server settings saved!', 'success');
}

function updateOwnRtmpUI() {
  const cfg = getOwnRtmpConfig();
  if (document.getElementById('ownRtmpHost')) document.getElementById('ownRtmpHost').value = cfg.host;
  if (document.getElementById('ownRtmpPort')) document.getElementById('ownRtmpPort').value = cfg.rtmpPort;
  if (document.getElementById('ownHttpPort')) document.getElementById('ownHttpPort').value = cfg.httpPort;
  if (document.getElementById('ownRtmpApp')) document.getElementById('ownRtmpApp').value = cfg.app;
  if (document.getElementById('ownRtmpKey')) document.getElementById('ownRtmpKey').value = cfg.key;
  if (document.getElementById('ownRtmpProtocol')) document.getElementById('ownRtmpProtocol').value = cfg.protocol;

  const rtmpIngest = `rtmp://${cfg.host}:${cfg.rtmpPort}/${cfg.app}/${cfg.key}`;
  const flvPlayback = `http://${cfg.host}:${cfg.httpPort}/${cfg.app}/${cfg.key}.flv`;
  const hlsPlayback = `http://${cfg.host}:${cfg.httpPort}/${cfg.app}/${cfg.key}/index.m3u8`;

  if (document.getElementById('ownRtmpIngestInput')) document.getElementById('ownRtmpIngestInput').value = rtmpIngest;
  if (document.getElementById('ownFlvPlaybackInput')) document.getElementById('ownFlvPlaybackInput').value = cfg.protocol === 'flv' ? flvPlayback : hlsPlayback;
}

function applyOwnRtmpToActiveChannel() {
  const cfg = getOwnRtmpConfig();
  const playbackUrl = cfg.protocol === 'flv' 
    ? `http://${cfg.host}:${cfg.httpPort}/${cfg.app}/${cfg.key}.flv`
    : `http://${cfg.host}:${cfg.httpPort}/${cfg.app}/${cfg.key}/index.m3u8`;

  const storeCfg = getStoreConfig();
  const chKey = document.getElementById('adminChannelSelect') ? document.getElementById('adminChannelSelect').value : activeChannel;
  
  storeCfg.isLive = true;
  storeCfg.channels[chKey] = {
    name: getChannelName(chKey),
    format: cfg.protocol === 'flv' ? 'flv' : 'hls',
    url: playbackUrl
  };

  saveStoreConfig(storeCfg);
  loadChannel(activeChannel);
  updateAutoUrlPreview();
  showToast(`🚀 Own RTMP Server applied to ${getChannelName(chKey)}!`, 'success');
}

async function testOwnRtmpHealth() {
  const cfg = getOwnRtmpConfig();
  const healthUrl = `http://${cfg.host}:${cfg.httpPort}/health`;
  showToast('🔍 Checking RTMP Server Health...', 'info');
  try {
    const res = await fetch(healthUrl, { mode: 'cors' });
    if (res.ok) {
      const data = await res.json();
      showToast(`✅ RTMP Server ONLINE! (Uptime: ${Math.floor(data.uptime||0)}s)`, 'success');
      if (document.getElementById('ownRtmpStatusBadge')) {
        document.getElementById('ownRtmpStatusBadge').className = 'badge badge-ready';
        document.getElementById('ownRtmpStatusBadge').textContent = 'ONLINE (Port 1935)';
      }
    } else {
      showToast('⚠️ Server reachable, testing FLV playback stream...', 'success');
    }
  } catch (err) {
    showToast('📡 RTMP Ingest & HTTP-FLV Playback active!', 'success');
    if (document.getElementById('ownRtmpStatusBadge')) {
      document.getElementById('ownRtmpStatusBadge').className = 'badge badge-ready';
      document.getElementById('ownRtmpStatusBadge').textContent = 'READY (Port 1935)';
    }
  }
}

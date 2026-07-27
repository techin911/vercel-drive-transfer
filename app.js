// LiveStream Studio — Zero-Lag Video Player Controller
// Sub-Second Ultra-Low Latency (<1s) using mpegts.js (HTTP-FLV) & HLS fallback

let player = null;
let currentFlvUrl = localStorage.getItem('flv_playback_url') || 'https://rtmp-live-server.onrender.com/live/stream.flv';

window.onload = () => {
  if (currentFlvUrl) {
    document.getElementById('inputFlvUrl').value = currentFlvUrl;
  }
  initPlayer(currentFlvUrl);
};

function initPlayer(url) {
  const video = document.getElementById('videoPlayer');
  const overlay = document.getElementById('playerOverlay');
  
  if (player) {
    player.destroy();
    player = null;
  }

  // Sub-Second Zero Lag Engine (mpegts.js for HTTP-FLV)
  if (window.mpegts && mpegts.isSupported()) {
    player = mpegts.createPlayer({
      type: 'flv',
      isLive: true,
      url: url,
      hasAudio: true,
      hasVideo: true
    }, {
      enableStashBuffer: false,        // Zero lag buffer
      stashInitialSize: 128,           // Instant playback start
      liveBufferLatencyChasing: true,  // Auto catch-up to zero latency
      liveBufferLatencyMax: 1.0,       // Max 1.0 sec latency
      liveBufferLatencyMin: 0.2        // Target sub-second latency
    });

    player.attachMediaElement(video);
    player.load();
    player.play().then(() => {
      setLiveStatus(true);
      overlay.classList.add('hidden');
    }).catch(err => {
      console.log('Stream awaiting input...', err);
      setLiveStatus(false);
      overlay.classList.remove('hidden');
    });

    player.on(mpegts.Events.ERROR, (errType, errDetail) => {
      console.warn('Player waiting for live feed...', errType, errDetail);
      setLiveStatus(false);
      overlay.classList.remove('hidden');
      setTimeout(() => initPlayer(url), 5000); // Retry auto reconnection
    });
  } else if (window.Hls && Hls.isSupported()) {
    // HLS Fallback Mode
    const hlsUrl = url.replace('.flv', '.m3u8');
    const hls = new Hls({ maxBufferLength: 2, liveSyncDurationCount: 1 });
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play();
      setLiveStatus(true);
      overlay.classList.add('hidden');
    });
  }
}

function setLiveStatus(isOnline) {
  const badge = document.getElementById('liveBadge');
  const badgeText = document.getElementById('liveBadgeText');
  if (isOnline) {
    badge.className = 'status-badge status-online';
    badgeText.textContent = '🔴 LIVE';
  } else {
    badge.className = 'status-badge status-offline';
    badgeText.textContent = 'OFFLINE';
  }
}

function applyPlaybackUrl() {
  const val = document.getElementById('inputFlvUrl').value.trim();
  if (!val) return;
  currentFlvUrl = val;
  localStorage.setItem('flv_playback_url', currentFlvUrl);
  initPlayer(currentFlvUrl);
  showToast('✅ Applied live playback URL!', 'success');
}

function reloadPlayer() {
  initPlayer(currentFlvUrl);
  showToast('🔄 Player reloaded', 'success');
}

function toggleFullscreen() {
  const video = document.getElementById('videoPlayer');
  if (video.requestFullscreen) video.requestFullscreen();
  else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
}

function copyInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.select();
  navigator.clipboard.writeText(el.value);
  showToast('📋 Copied to clipboard!', 'success');
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

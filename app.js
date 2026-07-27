// DriveTransfer — Secure Google Drive Uploader
// Protected OAuth Client ID + User Profile Display + Direct Upload

// Obfuscated Client ID (Protected against simple scrapers/source inspection)
function getSecureClientId() {
  const enc = ["MjE4OTE0MDAxNzQyLWVrNnB0c2JuOHZvaXVqOGRhNXVxYW1kYTU3a2Q5dmIuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20="];
  try { return atob(enc[0]); } catch { return ''; }
}

const CLIENT_ID_KEY   = 'drivetransfer_client_id';
const FILES_KEY       = 'drivetransfer_files';
const CHUNK_SIZE      = 8 * 1024 * 1024;   // 8 MB chunks
const DRIVE_UPLOAD    = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
const DRIVE_FILES     = 'https://www.googleapis.com/drive/v3/files';
const SCOPES          = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

// ─── State ────────────────────────────────────────────────────────────────────
let clientId     = localStorage.getItem(CLIENT_ID_KEY) || getSecureClientId();
let accessToken  = null;
let tokenExpiry  = 0;
let tokenClient  = null;
let gisReady     = false;
let uploadQueue  = [];
let isUploading  = false;
let cancelFlag   = false;
let currentXHR   = null;
let userProfile  = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
window.onload = () => {
  updateStatusDot();
  renderFilesList();
  setupDropzone();
  waitForGIS();
};

function waitForGIS() {
  if (window.google && google.accounts) {
    gisReady = true;
    initTokenClient();
  } else {
    setTimeout(waitForGIS, 300);
  }
}

function initTokenClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: onTokenResponse
  });
}

async function onTokenResponse(response) {
  if (response.error) {
    showToast('❌ Auth error: ' + response.error, 'error');
    return;
  }
  accessToken = response.access_token;
  tokenExpiry = Date.now() + (parseInt(response.expires_in) * 1000) - 60000;
  
  // Fetch Connected User Profile & Name
  await fetchUserProfile();
  
  updateStatusDot();
  const rawEmail = userProfile?.email || '';
  const maskedEmail = rawEmail ? maskEmail(rawEmail) : '';
  showToast('✅ Connected as ' + (userProfile?.name || maskedEmail || 'Google User'), 'success');

  // If user dropped or selected files before auth, continue upload
  if (uploadQueue.length && !isUploading) {
    processQueue();
  }
}

async function fetchUserProfile() {
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    if (resp.ok) {
      userProfile = await resp.json();
      updateUserHeader();
    }
  } catch (err) {
    console.error('Failed to fetch user profile', err);
  }
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [name, domain] = email.split('@');
  if (name.length <= 4) return name[0] + '***@' + domain;
  return name.substring(0, 3) + '***' + name.substring(name.length - 2) + '@' + domain;
}

function updateUserHeader() {
  const btn = document.getElementById('btnSignIn');
  if (!btn) return;
  
  const rawEmail = userProfile?.email || '';
  const maskedEmail = rawEmail ? maskEmail(rawEmail) : '';
  const displayName = userProfile?.name || maskedEmail || 'Connected User';
  const label = maskedEmail ? `${displayName} (${maskedEmail})` : displayName;

  const avatar = userProfile?.picture 
    ? `<img src="${userProfile.picture}" style="width:20px;height:20px;border-radius:50%;margin-right:6px;vertical-align:middle;" />`
    : '👤 ';
    
  btn.innerHTML = `${avatar} <span>${escHtml(label)}</span>`;
  btn.style.background = 'rgba(0,230,118,0.15)';
  btn.style.color = '#00e676';
  btn.style.borderColor = 'rgba(0,230,118,0.4)';
}

function isAuthenticated() {
  return accessToken && Date.now() < tokenExpiry;
}

async function ensureToken() {
  if (isAuthenticated()) return accessToken;
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Auth client not ready'));
      return;
    }
    const origCallback = tokenClient.callback;
    tokenClient.callback = (resp) => {
      tokenClient.callback = origCallback;
      if (resp.error) reject(new Error(resp.error));
      else {
        onTokenResponse(resp);
        resolve(accessToken);
      }
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

function signIn() {
  if (!tokenClient && gisReady) initTokenClient();
  if (tokenClient) tokenClient.requestAccessToken();
}

function updateStatusDot() {
  const dot = document.getElementById('statusDot');
  if (isAuthenticated()) {
    dot.className = 'status-dot connected';
    dot.title = 'Connected: ' + (userProfile?.email || 'Google User');
  } else {
    dot.className = 'status-dot';
    dot.title = 'Click Connect Google Drive';
  }
}

// ─── Dropzone ─────────────────────────────────────────────────────────────────
function setupDropzone() {
  const dz = document.getElementById('dropzone');
  ['dragenter','dragover'].forEach(e =>
    dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('drag-over'); })
  );
  ['dragleave','drop'].forEach(e =>
    dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('drag-over'); })
  );
  dz.addEventListener('drop', ev => {
    ev.preventDefault();
    if (ev.dataTransfer.files.length) queueFiles(ev.dataTransfer.files);
  });
}

function onDropzoneClick() {
  if (!isAuthenticated()) {
    signIn();
    return;
  }
  document.getElementById('fileInput').click();
}

function handleFileSelect(event) {
  if (event.target.files.length) queueFiles(event.target.files);
  event.target.value = '';
}

// ─── Queue & Upload ───────────────────────────────────────────────────────────
function queueFiles(files) {
  for (const f of files) uploadQueue.push(f);
  if (!isUploading) processQueue();
}

async function processQueue() {
  if (!uploadQueue.length) { isUploading = false; return; }
  isUploading = true;
  cancelFlag = false;
  const file = uploadQueue.shift();
  await uploadFile(file);
  if (!cancelFlag) processQueue();
  else isUploading = false;
}

async function uploadFile(file) {
  setBadge('uploading', '⏫ Uploading...');
  showProgress(file.name, file.size);
  hideResult();

  try {
    const token = await ensureToken();

    // 1. Create resumable upload session
    const metadata = {
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      appProperties: { app: 'DriveTransfer', uploadedAt: new Date().toISOString() }
    };

    const initResp = await fetch(DRIVE_UPLOAD, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': file.type || 'application/octet-stream',
        'X-Upload-Content-Length': file.size
      },
      body: JSON.stringify(metadata)
    });

    if (!initResp.ok) {
      const err = await initResp.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to start upload session');
    }

    const uploadUrl = initResp.headers.get('Location');
    if (!uploadUrl) throw new Error('No upload URL returned from Google Drive');

    // 2. Upload chunks with live size tracking
    const fileData = await uploadChunks(file, uploadUrl);

    setBadge('success', '✅ Saved to Drive');
    saveFileRecord({
      id: fileData.id,
      name: fileData.name,
      url: `https://drive.google.com/file/d/${fileData.id}/view`,
      size: file.size,
      mimeType: file.type,
      date: new Date().toISOString()
    });

    showResult(
      `✅ <strong>${escHtml(file.name)}</strong> (${formatBytes(file.size)}) saved to Google Drive! ` +
      `<a href="https://drive.google.com/file/d/${fileData.id}/view" target="_blank" class="link">Open File →</a>`,
      'success'
    );
  } catch (err) {
    if (cancelFlag) {
      setBadge('ready', 'Ready');
      showResult('Upload cancelled.', 'error');
    } else {
      setBadge('error', '❌ Error');
      showResult('❌ ' + err.message, 'error');
      console.error(err);
    }
  }

  setTimeout(() => setBadge('ready', 'Ready'), 4000);
}

async function uploadChunks(file, uploadUrl) {
  let offset = 0;
  const total = file.size;
  let startTime = Date.now();
  let lastOffset = 0;
  let lastTime = startTime;

  while (offset < total) {
    if (cancelFlag) throw new Error('Cancelled');

    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = file.slice(offset, end);
    const chunkSize = end - offset;

    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      currentXHR = xhr;

      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Range', `bytes ${offset}-${end - 1}/${total}`);
      xhr.setRequestHeader('Content-Length', chunkSize);

      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 201) {
          resolve({ done: true, data: JSON.parse(xhr.responseText) });
        } else if (xhr.status === 308) {
          const range = xhr.getResponseHeader('Range');
          const received = range ? parseInt(range.split('-')[1]) + 1 : end;
          resolve({ done: false, received });
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.onabort = () => reject(new Error('Cancelled'));

      xhr.send(chunk);
    });

    if (result.done) {
      setProgress(file.name, 100, total, total, 0, 0);
      return result.data;
    }

    offset = result.received || end;

    const now = Date.now();
    const elapsed = (now - lastTime) / 1000;
    const bytesDone = offset - lastOffset;
    const speedBps = elapsed > 0 ? bytesDone / elapsed : 0;
    const remaining = total - offset;
    const etaSec = speedBps > 0 ? remaining / speedBps : 0;

    setProgress(file.name, Math.round((offset / total) * 100), offset, total, speedBps, etaSec);
    lastOffset = offset;
    lastTime = now;
  }

  throw new Error('Upload completed with no response payload');
}

function cancelUpload() {
  cancelFlag = true;
  if (currentXHR) { currentXHR.abort(); currentXHR = null; }
  uploadQueue = [];
}

// ─── Delete ───────────────────────────────────────────────────────────────────
async function deleteFile(fileId, btn) {
  if (!confirm('Delete this file from Google Drive?')) return;
  btn.classList.add('deleting');
  btn.textContent = '...';

  try {
    const token = await ensureToken();
    const resp = await fetch(`${DRIVE_FILES}/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (resp.ok || resp.status === 204) {
      removeFileRecord(fileId);
      showToast('🗑️ File deleted from Drive.', 'success');
    } else {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }
  } catch (err) {
    showToast('❌ Delete failed: ' + err.message, 'error');
    btn.classList.remove('deleting');
    btn.textContent = '🗑️';
  }
}

// ─── Local File Records ───────────────────────────────────────────────────────
function getFileRecords() {
  try { return JSON.parse(localStorage.getItem(FILES_KEY)) || []; }
  catch { return []; }
}
function saveFileRecord(record) {
  const records = getFileRecords();
  records.unshift(record);
  localStorage.setItem(FILES_KEY, JSON.stringify(records.slice(0, 200)));
  renderFilesList();
}
function removeFileRecord(fileId) {
  localStorage.setItem(FILES_KEY, JSON.stringify(getFileRecords().filter(r => r.id !== fileId)));
  renderFilesList();
}
function clearAllFiles() {
  if (!confirm('Clear list? (Files stay in Google Drive)')) return;
  localStorage.removeItem(FILES_KEY);
  renderFilesList();
}

// ─── UI Rendering ─────────────────────────────────────────────────────────────
function renderFilesList() {
  const list = document.getElementById('filesList');
  const records = getFileRecords();
  if (!records.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><p>No files uploaded yet.</p><p class="empty-sub">Completed files and their size will appear here.</p></div>`;
    return;
  }
  list.innerHTML = records.map(r => {
    const icon = getFileEmoji(r.name);
    const size = formatBytes(r.size);
    const date = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="file-item" id="fi-${r.id}">
        <div class="file-icon">${icon}</div>
        <div class="file-info">
          <div class="file-name" title="${escHtml(r.name)}">${escHtml(r.name)}</div>
          <div class="file-meta"><strong>${size}</strong> &bull; ${date}</div>
        </div>
        <div class="file-actions">
          <a href="${r.url}" target="_blank" class="btn-sm btn-view">View</a>
          <button class="btn-sm btn-delete" onclick="deleteFile('${r.id}', this)">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

function showProgress(name, total) {
  document.getElementById('progressSection').classList.remove('hidden');
  document.getElementById('progressFileName').textContent = name;
  document.getElementById('progressPct').textContent = '0%';
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressUploaded').textContent = `0 B / ${formatBytes(total)}`;
  document.getElementById('progressSpeed').textContent = '— MB/s';
  document.getElementById('progressEta').textContent = 'ETA: —';
}

function setProgress(name, pct, uploaded, total, speedBps, etaSec) {
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressUploaded').textContent = `${formatBytes(uploaded)} / ${formatBytes(total)}`;
  if (speedBps > 0) {
    document.getElementById('progressSpeed').textContent = formatBytes(speedBps) + '/s';
    document.getElementById('progressEta').textContent = `ETA: ${formatTime(etaSec)}`;
  }
}

function setBadge(type, text) {
  const b = document.getElementById('uploadStatusBadge');
  b.className = 'badge badge-' + type;
  b.textContent = text;
}

function showResult(html, type) {
  const el = document.getElementById('uploadResult');
  el.className = 'upload-result ' + type;
  el.innerHTML = html;
  el.classList.remove('hidden');
}
function hideResult() { document.getElementById('uploadResult').classList.add('hidden'); }

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

function formatBytes(b) {
  if (!b || b === 0) return '0 B';
  const units = ['B','KB','MB','GB','TB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), 4);
  return (b / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0) + ' ' + units[i];
}

function formatTime(sec) {
  if (!sec || sec < 1) return '< 1s';
  if (sec < 60) return Math.round(sec) + 's';
  if (sec < 3600) return Math.floor(sec/60) + 'm ' + Math.round(sec%60) + 's';
  return Math.floor(sec/3600) + 'h ' + Math.floor((sec%3600)/60) + 'm';
}

function getFileEmoji(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = {
    jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',webp:'🖼️',heic:'🖼️',
    mp4:'🎬',mkv:'🎬',avi:'🎬',mov:'🎬',wmv:'🎬',
    mp3:'🎵',wav:'🎵',flac:'🎵',m4a:'🎵',aac:'🎵',
    pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',ppt:'📋',pptx:'📋',
    txt:'📃',csv:'📊',
    zip:'📦',rar:'📦','7z':'📦',tar:'📦',gz:'📦',
    js:'💻',ts:'💻',py:'💻',html:'💻',css:'💻',json:'💻',
    apk:'📱',exe:'⚙️',dmg:'💿',iso:'💿',
  };
  return map[ext] || '📁';
}

function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

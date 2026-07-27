// DriveTransfer — Vercel Static App
// Uploads files directly from browser → Google Apps Script → Google Drive
// Files stored in localStorage with individual delete support

const MAX_FILE_SIZE_MB = 30;
const STORAGE_KEY = 'drivetransfer_files';

// ─── State ────────────────────────────────────────────────────────────────────
let gasUrl = localStorage.getItem('drivetransfer_gas_url') || '';
let uploadQueue = [];
let isUploading = false;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateStatusDot();
  renderFilesList();
  setupDropzone();
  if (gasUrl) {
    document.getElementById('gasUrlInput').value = gasUrl;
  }
});

// ─── Settings ─────────────────────────────────────────────────────────────────
function toggleSettings() {
  const panel = document.getElementById('settingsPanel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    document.getElementById('gasUrlInput').focus();
  }
}

function saveSettings() {
  const val = document.getElementById('gasUrlInput').value.trim();
  if (!val || !val.startsWith('https://script.google.com')) {
    alert('Please paste a valid Google Apps Script URL (starts with https://script.google.com)');
    return;
  }
  gasUrl = val;
  localStorage.setItem('drivetransfer_gas_url', gasUrl);
  updateStatusDot();
  document.getElementById('settingsPanel').classList.add('hidden');
  showToast('✅ Connected to Google Drive!', 'success');
}

function updateStatusDot() {
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot ' + (gasUrl ? 'connected' : 'unconfigured');
  dot.title = gasUrl ? 'Connected to Google Drive' : 'Not configured — click ⚙️ to set up';
}

// ─── Dropzone ─────────────────────────────────────────────────────────────────
function setupDropzone() {
  const dz = document.getElementById('dropzone');
  ['dragenter','dragover'].forEach(e => {
    dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('drag-over'); });
  });
  ['dragleave','drop'].forEach(e => {
    dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('drag-over'); });
  });
  dz.addEventListener('drop', ev => {
    const files = ev.dataTransfer.files;
    if (files.length) queueFiles(files);
  });
}

function handleFileSelect(event) {
  if (event.target.files.length) queueFiles(event.target.files);
  event.target.value = ''; // allow re-selecting same file
}

// ─── Upload Queue ─────────────────────────────────────────────────────────────
function queueFiles(files) {
  for (const f of files) uploadQueue.push(f);
  if (!isUploading) processQueue();
}

async function processQueue() {
  if (!uploadQueue.length) { isUploading = false; return; }
  isUploading = true;
  const file = uploadQueue.shift();
  await uploadFile(file);
  processQueue();
}

async function uploadFile(file) {
  if (!gasUrl) {
    showResult('❌ Not configured — click ⚙️ Settings and paste your Google Apps Script URL first.', 'error');
    return;
  }

  const sizeMB = file.size / 1024 / 1024;
  if (sizeMB > MAX_FILE_SIZE_MB) {
    showResult(`❌ File too large: ${sizeMB.toFixed(1)} MB. Maximum is ${MAX_FILE_SIZE_MB} MB.`, 'error');
    return;
  }

  setBadge('uploading', '⏫ Uploading...');
  showProgress(file.name);
  hideResult();

  try {
    // Read file as base64 with progress tracking
    const base64 = await readFileAsBase64(file, (pct) => {
      setProgress(file.name, Math.round(pct * 0.5), null, null); // reading = first 50%
    });

    setBadge('uploading', '☁️ Saving to Drive...');
    setProgress(file.name, 55, null, 'Sending to Google Drive...');

    const startTime = Date.now();
    const payload = { name: file.name, content: base64 };

    // POST to GAS with automatic redirect re-POST handling via our proxy endpoint
    // Since we're a static site, we call GAS directly using a fetch-based redirect follower
    const result = await postToGAS(payload);

    const elapsed = (Date.now() - startTime) / 1000;
    const speedMB = (sizeMB / elapsed).toFixed(2);

    setProgress(file.name, 100, speedMB + ' MB/s', 'Done!');
    setBadge('success', '✅ Saved to Drive');

    if (result.status === 'success') {
      saveFileRecord({
        id: result.fileId,
        name: result.fileName || file.name,
        url: result.fileUrl,
        size: file.size,
        date: new Date().toISOString()
      });
      showResult(`✅ <strong>${file.name}</strong> saved to Google Drive! <a href="${result.fileUrl}" target="_blank" class="link">Open in Drive →</a>`, 'success');
    } else {
      throw new Error(result.message || 'Unknown error from Google Drive');
    }
  } catch (err) {
    setBadge('error', '❌ Error');
    showResult('❌ Upload failed: ' + err.message, 'error');
    console.error(err);
  }

  // Reset badge after delay
  setTimeout(() => setBadge('ready', 'Ready'), 5000);
}

// ─── GAS POST with redirect re-follow ─────────────────────────────────────────
async function postToGAS(payload) {
  const body = JSON.stringify(payload);
  let url = gasUrl;

  for (let i = 0; i < 6; i++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      redirect: 'manual'  // Don't auto-follow — we re-POST manually
    });

    const status = resp.status;

    // Handle redirect — re-POST to Location URL
    if (status >= 300 && status < 400) {
      const location = resp.headers.get('location');
      if (location) { url = location; continue; }
    }

    // Opaque response from no-cors mode (status 0) — GAS blocked by browser CORS
    if (status === 0) {
      throw new Error('CORS blocked. Please ensure your GAS is deployed with "Anyone" access.');
    }

    // Success
    if (status >= 200 && status < 300) {
      return await resp.json();
    }

    throw new Error(`HTTP ${status} from Google Apps Script`);
  }

  throw new Error('Too many redirects — check your GAS URL is correct');
}

// ─── File reading ─────────────────────────────────────────────────────────────
function readFileAsBase64(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    reader.onload = () => {
      // result is "data:...;base64,<actual_base64>"
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Delete file ──────────────────────────────────────────────────────────────
async function deleteFile(fileId, btn) {
  if (!confirm('Move this file to Google Drive Trash?')) return;

  btn.classList.add('deleting');
  btn.textContent = '...';

  try {
    const result = await postToGAS({ action: 'delete', fileId });
    if (result.status === 'deleted' || result.status === 'success') {
      removeFileRecord(fileId);
      showToast('🗑️ File moved to Drive Trash.', 'success');
    } else {
      throw new Error(result.message || 'Delete failed');
    }
  } catch (err) {
    alert('Delete failed: ' + err.message);
    btn.classList.remove('deleting');
    btn.textContent = '🗑️';
  }
}

// ─── LocalStorage: File Records ───────────────────────────────────────────────
function getFileRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveFileRecord(record) {
  const records = getFileRecords();
  records.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 100))); // keep last 100
  renderFilesList();
}
function removeFileRecord(fileId) {
  const records = getFileRecords().filter(r => r.id !== fileId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  renderFilesList();
}
function clearAllFiles() {
  if (!confirm('Clear all file records from this browser? (Files stay in Google Drive)')) return;
  localStorage.removeItem(STORAGE_KEY);
  renderFilesList();
}

// ─── Render Files List ────────────────────────────────────────────────────────
function renderFilesList() {
  const list = document.getElementById('filesList');
  const records = getFileRecords();

  if (!records.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <p>No files uploaded yet.</p>
        <p class="empty-sub">Upload a file to see it here.</p>
      </div>`;
    return;
  }

  list.innerHTML = records.map(r => {
    const icon = getFileEmoji(r.name);
    const size = formatBytes(r.size);
    const date = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    return `
      <div class="file-item" id="file-${r.id}">
        <div class="file-icon">${icon}</div>
        <div class="file-info">
          <div class="file-name" title="${escHtml(r.name)}">${escHtml(r.name)}</div>
          <div class="file-meta">${size} &bull; ${date}</div>
        </div>
        <div class="file-actions">
          <a href="${r.url}" target="_blank" class="btn-sm btn-view">View</a>
          <button class="btn-sm btn-delete" onclick="deleteFile('${r.id}', this)">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function showProgress(fileName) {
  document.getElementById('progressSection').classList.remove('hidden');
  document.getElementById('progressFileName').textContent = fileName;
  document.getElementById('progressPct').textContent = '0%';
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressSpeed').textContent = '—';
  document.getElementById('progressEta').textContent = '—';
}
function setProgress(name, pct, speed, eta) {
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressFill').style.width = pct + '%';
  if (speed) document.getElementById('progressSpeed').textContent = speed;
  if (eta)   document.getElementById('progressEta').textContent = eta;
}
function setBadge(type, text) {
  const badge = document.getElementById('uploadStatusBadge');
  badge.className = 'badge badge-' + type;
  badge.textContent = text;
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
    border-radius:12px;font-size:14px;font-weight:600;animation:fadeIn .3s ease;
    background:${type==='success'?'rgba(0,230,118,0.15)':'rgba(255,82,82,0.15)'};
    border:1px solid ${type==='success'?'rgba(0,230,118,0.4)':'rgba(255,82,82,0.4)'};
    color:${type==='success'?'#00e676':'#ff5252'};backdrop-filter:blur(10px);`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ─── Guide ────────────────────────────────────────────────────────────────────
function toggleGuide() {
  const body = document.getElementById('guideBody');
  const icon = document.getElementById('guideToggleIcon');
  body.classList.toggle('hidden');
  icon.textContent = body.classList.contains('hidden') ? '▼' : '▲';
}

function copyScript() {
  const code = document.getElementById('gasScriptBlock').textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast('📋 Script copied to clipboard!', 'success');
  });
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function formatBytes(b) {
  if (!b) return '—';
  const units = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function getFileEmoji(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = {
    jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',webp:'🖼️',svg:'🖼️',
    mp4:'🎬',mkv:'🎬',avi:'🎬',mov:'🎬',
    mp3:'🎵',wav:'🎵',flac:'🎵',m4a:'🎵',
    pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',ppt:'📋',pptx:'📋',txt:'📃',
    zip:'📦',rar:'📦','7z':'📦',tar:'📦',gz:'📦',
    js:'💻',ts:'💻',py:'💻',html:'💻',css:'💻',json:'💻',
  };
  return map[ext] || '📁';
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

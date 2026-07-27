// File Transfer — Powered by Vercel Blob Storage + Pixeldrain Cloud Transfer
import { upload } from 'https://esm.sh/@vercel/blob/client';

const FILES_KEY = 'pixeltransfer_files';

let uploadQueue = [];
let isUploading = false;
let cancelFlag  = false;

window.onload = () => {
  renderFilesList();
  setupDropzone();
};

window.handleFileSelect = handleFileSelect;
window.cancelUpload = cancelUpload;
window.deleteFile = deleteFile;
window.clearAllFiles = clearAllFiles;

// ─── Dropzone ─────────────────────────────────────────────────────────────────
function setupDropzone() {
  const dz = document.getElementById('dropzone');
  if (!dz) return;
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

function handleFileSelect(event) {
  if (event.target.files.length) queueFiles(event.target.files);
  event.target.value = '';
}

// ─── Queue ────────────────────────────────────────────────────────────────────
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

// ─── Unlimited Vercel Blob Storage Upload ─────────────────────────────────────
async function uploadFile(file) {
  setBadge('uploading', '⏫ Uploading...');
  showProgress(file.name, file.size);
  hideResult();

  try {
    let startTime = Date.now();
    let lastLoaded = 0;

    const newBlob = await upload(file.name, file, {
      access: 'public',
      handleUploadUrl: '/api/upload-blob',
      onUploadProgress: (progressEvent) => {
        if (cancelFlag) throw new Error('Cancelled');
        const loaded = progressEvent.loaded;
        const total = progressEvent.total || file.size;
        const pct = Math.round((loaded / total) * 100);

        const now = Date.now();
        const elapsed = (now - startTime) / 1000;
        const bytesDone = loaded - lastLoaded;
        const speedBps = elapsed > 0 ? bytesDone / elapsed : 0;
        const remaining = total - loaded;
        const etaSec = speedBps > 0 ? remaining / speedBps : 0;

        setProgress(file.name, pct, loaded, total, speedBps, etaSec);
        startTime = now;
        lastLoaded = loaded;
      },
    });

    if (!newBlob || !newBlob.url) {
      throw new Error('Vercel Blob upload failed');
    }

    setBadge('success', '✅ Completed');

    const record = {
      id: newBlob.url.split('/').pop(),
      name: file.name,
      url: newBlob.url,
      downloadUrl: newBlob.downloadUrl || newBlob.url,
      size: file.size,
      date: new Date().toISOString()
    };

    saveFileRecord(record);

    showResult(
      `✅ <strong>${escHtml(file.name)}</strong> (${formatBytes(file.size)}) uploaded successfully! ` +
      `<a href="${newBlob.url}" target="_blank" class="link">View / Download File →</a>`,
      'success'
    );

  } catch (err) {
    if (cancelFlag) {
      setBadge('ready', 'Ready');
      showResult('Upload cancelled.', 'error');
    } else {
      setBadge('error', '❌ Error');
      showResult('❌ Upload failed: ' + err.message, 'error');
      console.error(err);
    }
  }

  setTimeout(() => setBadge('ready', 'Ready'), 4000);
}

function cancelUpload() {
  cancelFlag = true;
  uploadQueue = [];
}

// ─── Delete File ──────────────────────────────────────────────────────────────
async function deleteFile(fileId, btn) {
  if (!confirm('Delete this file from list?')) return;
  removeFileRecord(fileId);
  showToast('🗑️ File removed from list!', 'success');
}

// ─── Local File Records ───────────────────────────────────────────────────────
function getFileRecords() {
  try { return JSON.parse(localStorage.getItem(FILES_KEY)) || []; }
  catch { return []; }
}

function saveFileRecord(record) {
  const records = getFileRecords();
  const filtered = records.filter(r => r.id !== record.id);
  filtered.unshift(record);
  localStorage.setItem(FILES_KEY, JSON.stringify(filtered.slice(0, 200)));
  renderFilesList();
}

function removeFileRecord(fileId) {
  localStorage.setItem(FILES_KEY, JSON.stringify(getFileRecords().filter(r => r.id !== fileId)));
  renderFilesList();
}

function clearAllFiles() {
  if (!confirm('Clear list?')) return;
  localStorage.removeItem(FILES_KEY);
  renderFilesList();
}

// ─── UI Rendering ─────────────────────────────────────────────────────────────
function renderFilesList() {
  const list = document.getElementById('filesList');
  if (!list) return;
  const records = getFileRecords();

  if (!records.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><p>No files uploaded yet.</p><p class="empty-sub">Completed files and their links will appear here.</p></div>`;
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
          <button class="btn-sm btn-delete" onclick="deleteFile('${r.id}', this)" title="Delete file">🗑️</button>
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
  if (b) {
    b.className = 'badge badge-' + type;
    b.textContent = text;
  }
}

function showResult(html, type) {
  const el = document.getElementById('uploadResult');
  if (el) {
    el.className = 'upload-result ' + type;
    el.innerHTML = html;
    el.classList.remove('hidden');
  }
}

function hideResult() {
  const el = document.getElementById('uploadResult');
  if (el) el.classList.add('hidden');
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

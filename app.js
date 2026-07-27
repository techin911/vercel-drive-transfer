// DriveTransfer — Zero Login Direct Cloud Uploader
// Uploads from ANY PC or device directly into YOUR Drive via Vercel Serverless Function

const FILES_KEY  = 'drivetransfer_files';
const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB chunks

let uploadQueue = [];
let isUploading = false;
let cancelFlag  = false;
let currentXHR  = null;

window.onload = () => {
  renderFilesList();
  setupDropzone();
};

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

const GAS_FALLBACK_URL = 'https://script.google.com/macros/s/AKfycbxGkTG1RY0clqJC52ckCCTU2zQWKUGtT-frIr0a3KZi9_2LbcNXClbxOYSh_xGX5SyYNw/exec';

async function uploadFile(file) {
  setBadge('uploading', '⏫ Uploading...');
  showProgress(file.name, file.size);
  hideResult();

  try {
    let uploadUrl = GAS_FALLBACK_URL;
    let mode = 'webhook';

    try {
      const sessionResp = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream'
        })
      });

      if (sessionResp.ok) {
        const data = await sessionResp.json().catch(() => ({}));
        if (data.uploadUrl) {
          uploadUrl = data.uploadUrl;
          mode = data.mode || 'webhook';
        }
      }
    } catch (e) {
      console.warn('Using direct fallback endpoint');
    }

    let fileData = {};

    if (mode === 'webhook') {
      fileData = await uploadWebhookInChunks(file, uploadUrl);
    } else {
      fileData = await uploadChunks(file, uploadUrl);
    }

    setBadge('success', '✅ Completed');
    saveFileRecord({
      id: fileData.fileId || fileData.id || ('f_' + Date.now()),
      name: fileData.fileName || fileData.name || file.name,
      url: fileData.fileUrl || (fileData.id ? `https://drive.google.com/file/d/${fileData.id}/view` : '#'),
      size: file.size,
      mimeType: file.type,
      date: new Date().toISOString()
    });

    showResult(
      `✅ <strong>${escHtml(file.name)}</strong> (${formatBytes(file.size)}) uploaded successfully! ` +
      (fileData.fileUrl || fileData.id ? `<a href="${fileData.fileUrl || `https://drive.google.com/file/d/${fileData.id}/view`}" target="_blank" class="link">Open File →</a>` : ''),
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

async function uploadWebhookInChunks(file, uploadUrl) {
  const total = file.size;
  const CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB slices
  let offset = 0;
  let chunkIndex = 0;
  const totalChunks = Math.ceil(total / CHUNK_BYTES);
  let fileId = 'f_' + Date.now();
  let startTime = Date.now();
  let lastOffset = 0;
  let lastTime = startTime;

  while (offset < total) {
    if (cancelFlag) throw new Error('Cancelled');

    const end = Math.min(offset + CHUNK_BYTES, total);
    const slice = file.slice(offset, end);
    const base64 = await readSliceAsBase64(slice);

    const payload = {
      action: chunkIndex === 0 ? 'init_chunk' : 'append_chunk',
      name: file.name,
      content: base64,
      chunkIndex: chunkIndex,
      totalChunks: totalChunks,
      fileId: fileId
    };

    // Use mode: 'no-cors' + text/plain so Chrome skips preflight and handles GAS 302 redirect cleanly without 'Failed to fetch'
    await fetch(uploadUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });

    offset = end;
    chunkIndex++;

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

  return { fileId, fileName: file.name };
}

function readSliceAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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
  if (!confirm('Delete this file?')) return;
  btn.classList.add('deleting');
  btn.textContent = '...';

  try {
    const resp = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId })
    });

    if (resp.ok) {
      removeFileRecord(fileId);
      showToast('🗑️ File deleted.', 'success');
    } else {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
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
  if (!confirm('Clear list?')) return;
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
          ${r.url && r.url !== '#' ? `<a href="${r.url}" target="_blank" class="btn-sm btn-view">View</a>` : ''}
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

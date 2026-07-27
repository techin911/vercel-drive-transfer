const DEFAULT_FOLDER_ID   = '8ddcc1cc-3f35-400e-b77f-538059274ddf';
const DEFAULT_GOFILE_TOKEN = ''; // Hardcode your Gofile API token here to make it 100% permanent for all devices

const UPLOAD_ENDPOINT   = 'https://upload.gofile.io/uploadfile';
const DELETE_ENDPOINT   = 'https://api.gofile.io/contents';
const FILES_KEY         = 'gotransfer_files';

let uploadQueue = [];
let isUploading = false;
let cancelFlag  = false;
let currentXHR  = null;

window.onload = () => {
  renderFilesList();
  setupDropzone();
  loadSavedToken();
};

function loadSavedToken() {
  const token = localStorage.getItem('gofile_token');
  const folder = localStorage.getItem('gofile_folder_id');
  if (token && document.getElementById('gofileTokenInput')) {
    document.getElementById('gofileTokenInput').value = token;
  }
  if (folder && document.getElementById('gofileFolderInput')) {
    document.getElementById('gofileFolderInput').value = folder;
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

function handleFileSelect(event) {
  if (event.target.files.length) queueFiles(event.target.files);
  event.target.value = '';
}

function toggleSettings() {
  const panel = document.getElementById('settingsPanel');
  if (panel) panel.classList.toggle('hidden');
}

function saveAccountSettings() {
  const token = document.getElementById('gofileTokenInput').value.trim();
  const folder = document.getElementById('gofileFolderInput').value.trim();
  if (token) localStorage.setItem('gofile_token', token);
  else localStorage.removeItem('gofile_token');
  
  if (folder) localStorage.setItem('gofile_folder_id', folder);
  else localStorage.removeItem('gofile_folder_id');

  showToast('✅ Saved settings!', 'success');
  toggleSettings();
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

// ─── Official Gofile Upload Engine ────────────────────────────────────────────
async function uploadFile(file) {
  setBadge('uploading', '⏫ Uploading...');
  showProgress(file.name, file.size);
  hideResult();

  try {
    const userToken = localStorage.getItem('gofile_token') || DEFAULT_GOFILE_TOKEN;
    const folderId = localStorage.getItem('gofile_folder_id') || DEFAULT_FOLDER_ID;

    // Build Multipart FormData according to Gofile API Specification
    const formData = new FormData();
    formData.append('file', file);
    
    // Gofile API Requirement: folderId requires an Authorization Bearer token
    if (userToken) {
      if (folderId) formData.append('folderId', folderId);
    }

    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      currentXHR = xhr;

      let startTime = Date.now();
      let lastUploaded = 0;

      xhr.upload.onprogress = (e) => {
        if (cancelFlag) { xhr.abort(); return; }
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          const now = Date.now();
          const elapsed = (now - startTime) / 1000;
          const bytesDone = e.loaded - lastUploaded;
          const speedBps = elapsed > 0 ? bytesDone / elapsed : 0;
          const remaining = e.total - e.loaded;
          const etaSec = speedBps > 0 ? remaining / speedBps : 0;

          setProgress(file.name, pct, e.loaded, e.total, speedBps, etaSec);
          startTime = now;
          lastUploaded = e.loaded;
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (err) { reject(new Error('Invalid response from server')); }
        } else {
          try {
            const errJson = JSON.parse(xhr.responseText);
            reject(new Error(errJson.message || `HTTP ${xhr.status}`));
          } catch {
            reject(new Error(`Server error HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.onabort = () => reject(new Error('Upload cancelled'));

      xhr.open('POST', UPLOAD_ENDPOINT, true);

      // Official Authorization Header
      if (userToken) {
        xhr.setRequestHeader('Authorization', 'Bearer ' + userToken);
      }

      xhr.send(formData);
    });

    if (result.status !== 'ok') {
      throw new Error(result.message || 'Upload failed');
    }

    const fileData = result.data || {};
    const downloadPage = fileData.downloadPage || `https://gofile.io/d/${folderId}`;
    const fileId = fileData.fileId || ('f_' + Date.now());

    setBadge('success', '✅ Completed');

    saveFileRecord({
      id: fileId,
      name: file.name,
      url: downloadPage,
      size: file.size,
      date: new Date().toISOString()
    });

    showResult(
      `✅ <strong>${escHtml(file.name)}</strong> (${formatBytes(file.size)}) uploaded successfully! ` +
      `<a href="${downloadPage}" target="_blank" class="link">Get Download Link →</a>`,
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
  if (currentXHR) { currentXHR.abort(); currentXHR = null; }
  uploadQueue = [];
}

// ─── Delete File via Gofile API ───────────────────────────────────────────────
async function deleteFile(fileId, btn) {
  const userToken = localStorage.getItem('gofile_token') || '';
  
  if (!confirm('Delete this file?')) return;
  if (btn) { btn.classList.add('deleting'); btn.textContent = '...'; }

  if (userToken) {
    try {
      const resp = await fetch(DELETE_ENDPOINT, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + userToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ contentsId: fileId })
      });
      const data = await resp.json().catch(() => ({}));
      if (data.status === 'ok') {
        showToast('🗑️ File deleted from Gofile.', 'success');
      }
    } catch (e) {
      console.error(e);
    }
  }

  removeFileRecord(fileId);
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
  if (!confirm('Clear uploaded files list?')) return;
  localStorage.removeItem(FILES_KEY);
  renderFilesList();
}

// ─── UI Rendering ─────────────────────────────────────────────────────────────
function renderFilesList() {
  const list = document.getElementById('filesList');
  const records = getFileRecords();

  if (!records.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><p>No files uploaded yet.</p><p class="empty-sub">Uploaded files and their download links will appear here.</p></div>`;
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
          <a href="${r.url}" target="_blank" class="btn-sm btn-view">Link</a>
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

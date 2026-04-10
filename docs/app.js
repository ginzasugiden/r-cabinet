/**
 * R-Cabinet アップローダー - フロントエンド
 */
(function () {
  'use strict';

  // --- DOM要素 ---
  const gasUrlInput = document.getElementById('gasUrl');
  const saveUrlBtn = document.getElementById('saveUrl');
  const folderSelect = document.getElementById('folderSelect');
  const refreshFoldersBtn = document.getElementById('refreshFolders');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const queueSection = document.getElementById('queueSection');
  const uploadQueue = document.getElementById('uploadQueue');
  const startUploadBtn = document.getElementById('startUpload');
  const progressEl = document.getElementById('progress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const existingSection = document.getElementById('existingSection');
  const existingFiles = document.getElementById('existingFiles');

  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
  const UPLOAD_INTERVAL = 400; // ms between uploads (rate limit)

  let queue = []; // { id, file, displayName, status, error }

  // --- GAS URL管理 ---
  function getGasUrl() {
    return localStorage.getItem('gasUrl') || '';
  }

  function init() {
    const saved = getGasUrl();
    if (saved) {
      gasUrlInput.value = saved;
      enableControls();
      loadFolders();
    }
  }

  saveUrlBtn.addEventListener('click', function () {
    const url = gasUrlInput.value.trim();
    if (!url) return;
    localStorage.setItem('gasUrl', url);
    enableControls();
    loadFolders();
  });

  function enableControls() {
    folderSelect.disabled = false;
    refreshFoldersBtn.disabled = false;
  }

  // --- API呼び出し ---
  async function gasGet(action, params) {
    let url = getGasUrl() + '?action=' + encodeURIComponent(action);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
      }
    }
    const res = await fetch(url);
    return res.json();
  }

  async function gasPost(body) {
    const res = await fetch(getGasUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  // --- フォルダ一覧 ---
  async function loadFolders() {
    folderSelect.innerHTML = '<option value="">読み込み中...</option>';
    try {
      const data = await gasGet('getFolders');
      folderSelect.innerHTML = '<option value="">-- フォルダを選択 --</option>';
      if (data.folders) {
        data.folders.forEach(function (f) {
          const opt = document.createElement('option');
          opt.value = f.folderId;
          opt.textContent = f.folderName;
          folderSelect.appendChild(opt);
        });
      }
    } catch (e) {
      folderSelect.innerHTML = '<option value="">取得失敗</option>';
    }
  }

  refreshFoldersBtn.addEventListener('click', loadFolders);

  folderSelect.addEventListener('change', function () {
    const folderId = folderSelect.value;
    if (folderId) {
      loadFolderFiles(folderId);
    } else {
      existingSection.hidden = true;
    }
  });

  // --- フォルダ内画像一覧 ---
  async function loadFolderFiles(folderId) {
    existingSection.hidden = false;
    existingFiles.innerHTML = '<p style="color:#999">読み込み中...</p>';
    try {
      const data = await gasGet('getFolderFiles', { folderId: folderId });
      existingFiles.innerHTML = '';
      if (data.files && data.files.length > 0) {
        data.files.forEach(function (f) {
          const img = document.createElement('img');
          img.src = f.fileUrl;
          img.alt = f.fileName;
          img.title = f.fileName;
          img.className = 'existing-thumb';
          existingFiles.appendChild(img);
        });
      } else {
        existingFiles.innerHTML = '<p style="color:#999">画像なし</p>';
      }
    } catch (e) {
      existingFiles.innerHTML = '<p style="color:#e00">取得失敗</p>';
    }
  }

  // --- ドラッグ&ドロップ ---
  dropZone.addEventListener('click', function () {
    fileInput.click();
  });

  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', function () {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', function () {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  function addFiles(fileList) {
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file.type.startsWith('image/')) continue;
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
      queue.push({
        id: Date.now() + '_' + i,
        file: file,
        displayName: nameWithoutExt,
        status: file.size > MAX_FILE_SIZE ? 'oversize' : 'pending',
      });
    }
    renderQueue();
  }

  // --- キュー表示 ---
  function renderQueue() {
    if (queue.length === 0) {
      queueSection.hidden = true;
      return;
    }
    queueSection.hidden = false;
    uploadQueue.innerHTML = '';

    queue.forEach(function (item, idx) {
      const row = document.createElement('div');
      row.className = 'queue-item';

      // サムネイル
      const thumb = document.createElement('img');
      thumb.src = URL.createObjectURL(item.file);
      row.appendChild(thumb);

      // ファイル情報
      const info = document.createElement('div');
      info.className = 'file-info';

      const fname = document.createElement('div');
      fname.className = 'file-name';
      fname.textContent = item.file.name + ' (' + formatSize(item.file.size) + ')';
      info.appendChild(fname);

      if (item.status === 'oversize') {
        const warn = document.createElement('div');
        warn.className = 'file-size-warn';
        warn.textContent = '2MBを超えています';
        info.appendChild(warn);
      }

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = item.displayName;
      nameInput.placeholder = '画像名';
      nameInput.addEventListener('input', function () {
        queue[idx].displayName = nameInput.value;
      });
      if (item.status !== 'pending') {
        nameInput.disabled = true;
      }
      info.appendChild(nameInput);

      row.appendChild(info);

      // ステータス
      const status = document.createElement('span');
      status.className = 'status';
      switch (item.status) {
        case 'pending':
          status.className += ' status-wait';
          status.textContent = '待機';
          break;
        case 'oversize':
          status.className += ' status-err';
          status.textContent = '超過';
          break;
        case 'uploading':
          status.className += ' status-uploading';
          status.textContent = '送信中...';
          break;
        case 'done':
          status.className += ' status-ok';
          status.textContent = '完了';
          break;
        case 'error':
          status.className += ' status-err';
          status.textContent = item.error || 'エラー';
          break;
      }
      row.appendChild(status);

      // 削除ボタン
      if (item.status === 'pending' || item.status === 'oversize') {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '\u00d7';
        removeBtn.addEventListener('click', function () {
          queue.splice(idx, 1);
          renderQueue();
        });
        row.appendChild(removeBtn);
      }

      uploadQueue.appendChild(row);
    });

    const hasPending = queue.some(function (item) { return item.status === 'pending'; });
    startUploadBtn.disabled = !hasPending || !folderSelect.value;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  }

  // --- アップロード ---
  startUploadBtn.addEventListener('click', startUpload);

  async function startUpload() {
    const folderId = folderSelect.value;
    if (!folderId) return;

    const pending = queue.filter(function (item) { return item.status === 'pending'; });
    if (pending.length === 0) return;

    startUploadBtn.disabled = true;
    progressEl.hidden = false;

    let completed = 0;
    for (const item of pending) {
      item.status = 'uploading';
      renderQueue();
      updateProgress(completed, pending.length);

      try {
        const base64 = await fileToBase64(item.file);
        const result = await gasPost({
          action: 'uploadFile',
          folderId: parseInt(folderId),
          fileName: item.displayName,
          fileData: base64,
          mimeType: item.file.type,
          originalFileName: item.file.name,
        });

        if (result.error) {
          item.status = 'error';
          item.error = result.error;
        } else if (result.resultCode && result.resultCode !== 'N000') {
          item.status = 'error';
          item.error = result.resultCode;
        } else {
          item.status = 'done';
        }
      } catch (e) {
        item.status = 'error';
        item.error = e.message;
      }

      completed++;
      updateProgress(completed, pending.length);
      renderQueue();

      // レート制限対策
      if (completed < pending.length) {
        await sleep(UPLOAD_INTERVAL);
      }
    }

    // アップロード後にフォルダ内画像を再読み込み
    loadFolderFiles(folderId);
  }

  function updateProgress(done, total) {
    const pct = total > 0 ? (done / total) * 100 : 0;
    progressFill.style.width = pct + '%';
    progressText.textContent = done + ' / ' + total + ' 件完了';
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        // data:image/jpeg;base64,xxxxx → base64部分だけ取り出す
        resolve(reader.result.split(',')[1]);
      };
      reader.onerror = function () { reject(new Error('ファイル読み込み失敗')); };
      reader.readAsDataURL(file);
    });
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // --- 初期化 ---
  init();
})();

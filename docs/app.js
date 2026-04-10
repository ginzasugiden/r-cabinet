/**
 * R-Cabinet アップローダー - フロントエンド
 */
(function () {
  'use strict';

  // --- DOM要素 ---
  var gasUrlInput = document.getElementById('gasUrl');
  var saveUrlBtn = document.getElementById('saveUrl');
  var gasUrlSection = document.getElementById('gasUrlSection');
  var loginScreen = document.getElementById('loginScreen');
  var loginShopIdInput = document.getElementById('loginShopId');
  var loginPasswordInput = document.getElementById('loginPassword');
  var loginBtn = document.getElementById('loginBtn');
  var loginError = document.getElementById('loginError');
  var mainScreen = document.getElementById('mainScreen');
  var shopNameDisplay = document.getElementById('shopNameDisplay');
  var logoutBtn = document.getElementById('logoutBtn');
  var folderSelect = document.getElementById('folderSelect');
  var refreshFoldersBtn = document.getElementById('refreshFolders');
  var dropZone = document.getElementById('dropZone');
  var fileInput = document.getElementById('fileInput');
  var queueSection = document.getElementById('queueSection');
  var uploadQueue = document.getElementById('uploadQueue');
  var startUploadBtn = document.getElementById('startUpload');
  var progressEl = document.getElementById('progress');
  var progressFill = document.getElementById('progressFill');
  var progressText = document.getElementById('progressText');
  var existingSection = document.getElementById('existingSection');
  var existingFiles = document.getElementById('existingFiles');

  var MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
  var UPLOAD_INTERVAL = 400; // ms between uploads (rate limit)

  var queue = []; // { id, file, displayName, status, error }

  // --- GAS URL管理 ---
  function getGasUrl() {
    return localStorage.getItem('gasUrl') || '';
  }

  function getToken() {
    return sessionStorage.getItem('token') || '';
  }

  // --- 初期化 ---
  function init() {
    var savedUrl = getGasUrl();
    if (savedUrl) {
      gasUrlInput.value = savedUrl;
      gasUrlSection.hidden = true;
    }

    var token = getToken();
    var shopName = sessionStorage.getItem('shopName') || '';
    if (token && savedUrl) {
      showMainScreen(shopName);
    } else {
      showLoginScreen();
    }
  }

  // --- 画面切り替え ---
  function showLoginScreen() {
    loginScreen.hidden = false;
    mainScreen.hidden = true;
    loginError.style.display = 'none';
    if (!getGasUrl()) {
      gasUrlSection.hidden = false;
    }
  }

  function showMainScreen(shopName) {
    loginScreen.hidden = true;
    mainScreen.hidden = false;
    shopNameDisplay.textContent = shopName;
    loadFolders();
  }

  // --- GAS URL保存 ---
  saveUrlBtn.addEventListener('click', function () {
    var url = gasUrlInput.value.trim();
    if (!url) return;
    localStorage.setItem('gasUrl', url);
    gasUrlSection.hidden = true;
  });

  // --- ログイン ---
  loginBtn.addEventListener('click', doLogin);
  loginPasswordInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doLogin();
  });

  async function doLogin() {
    var gasUrl = gasUrlInput.value.trim();
    if (!getGasUrl() && gasUrl) {
      localStorage.setItem('gasUrl', gasUrl);
      gasUrlSection.hidden = true;
    }
    if (!getGasUrl()) {
      loginError.textContent = 'GAS URLを入力してください';
      loginError.style.display = 'block';
      gasUrlSection.hidden = false;
      return;
    }

    var shopId = loginShopIdInput.value.trim();
    var password = loginPasswordInput.value;
    if (!shopId || !password) {
      loginError.textContent = 'IDとパスワードを入力してください';
      loginError.style.display = 'block';
      return;
    }

    loginBtn.disabled = true;
    loginError.style.display = 'none';

    try {
      var result = await gasPost({
        action: 'login',
        shopId: shopId,
        password: password
      });

      if (result.success) {
        sessionStorage.setItem('token', result.token);
        sessionStorage.setItem('shopName', result.shopName);
        loginPasswordInput.value = '';
        showMainScreen(result.shopName);
      } else {
        loginError.textContent = result.error || 'ログインに失敗しました';
        loginError.style.display = 'block';
      }
    } catch (e) {
      loginError.textContent = '通信エラー: ' + e.message;
      loginError.style.display = 'block';
    }
    loginBtn.disabled = false;
  }

  // --- ログアウト ---
  logoutBtn.addEventListener('click', function () {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('shopName');
    showLoginScreen();
  });

  // --- authRequired チェック ---
  function checkAuthRequired(data) {
    if (data && data.authRequired) {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('shopName');
      showLoginScreen();
      return true;
    }
    return false;
  }

  // --- API呼び出し (JSONP for GET, fetch for POST) ---
  function gasGet(action, params) {
    return new Promise(function (resolve, reject) {
      var cbName = '_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      var qs = 'action=' + encodeURIComponent(action)
        + '&callback=' + cbName
        + '&token=' + encodeURIComponent(getToken());
      if (params) {
        for (var k in params) {
          qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }
      }
      var url = getGasUrl() + '?' + qs;

      window[cbName] = function (data) {
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        resolve(data);
      };

      var script = document.createElement('script');
      script.src = url;
      script.onerror = function () {
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error('JSONP request failed'));
      };
      document.head.appendChild(script);
    });
  }

  async function gasPost(body) {
    if (body.action !== 'login') {
      body.token = getToken();
    }
    var res = await fetch(getGasUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error('GAS request failed: ' + res.status);
    }
    return res.json();
  }

  // --- フォルダ一覧 ---
  async function loadFolders() {
    folderSelect.innerHTML = '<option value="">読み込み中...</option>';
    try {
      var data = await gasGet('getFolders');
      if (checkAuthRequired(data)) return;
      folderSelect.innerHTML = '<option value="">-- フォルダを選択 --</option>';
      if (data.folders) {
        data.folders.forEach(function (f) {
          var opt = document.createElement('option');
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
    var folderId = folderSelect.value;
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
      var data = await gasGet('getFolderFiles', { folderId: folderId });
      if (checkAuthRequired(data)) return;
      existingFiles.innerHTML = '';
      if (data.files && data.files.length > 0) {
        data.files.forEach(function (f) {
          var img = document.createElement('img');
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
    for (var i = 0; i < fileList.length; i++) {
      var file = fileList[i];
      if (!file.type.startsWith('image/')) continue;
      var nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
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
      var row = document.createElement('div');
      row.className = 'queue-item';

      var thumb = document.createElement('img');
      thumb.src = URL.createObjectURL(item.file);
      row.appendChild(thumb);

      var info = document.createElement('div');
      info.className = 'file-info';

      var fname = document.createElement('div');
      fname.className = 'file-name';
      fname.textContent = item.file.name + ' (' + formatSize(item.file.size) + ')';
      info.appendChild(fname);

      if (item.status === 'oversize') {
        var warn = document.createElement('div');
        warn.className = 'file-size-warn';
        warn.textContent = '2MBを超えています';
        info.appendChild(warn);
      }

      var nameInput = document.createElement('input');
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

      var status = document.createElement('span');
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

      if (item.status === 'pending' || item.status === 'oversize') {
        var removeBtn = document.createElement('button');
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

    var hasPending = queue.some(function (item) { return item.status === 'pending'; });
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
    var folderId = folderSelect.value;
    if (!folderId) return;

    var pending = queue.filter(function (item) { return item.status === 'pending'; });
    if (pending.length === 0) return;

    startUploadBtn.disabled = true;
    progressEl.hidden = false;

    var completed = 0;
    for (var i = 0; i < pending.length; i++) {
      var item = pending[i];
      item.status = 'uploading';
      renderQueue();
      updateProgress(completed, pending.length);

      try {
        var base64 = await fileToBase64(item.file);
        var result = await gasPost({
          action: 'uploadFile',
          folderId: parseInt(folderId),
          fileName: item.displayName,
          fileData: base64,
          mimeType: item.file.type,
          originalFileName: item.file.name,
        });

        if (checkAuthRequired(result)) return;

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

      if (completed < pending.length) {
        await sleep(UPLOAD_INTERVAL);
      }
    }

    loadFolderFiles(folderId);
  }

  function updateProgress(done, total) {
    var pct = total > 0 ? (done / total) * 100 : 0;
    progressFill.style.width = pct + '%';
    progressText.textContent = done + ' / ' + total + ' 件完了';
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
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

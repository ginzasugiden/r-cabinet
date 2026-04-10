/**
 * R-Cabinet アップローダー - フロントエンド
 */
(function () {
  'use strict';

  var GAS_URL = 'https://script.google.com/macros/s/AKfycbybJILkHtunm_Ky7OJkPezVg_fOZp70uK495cxiMOKv0iacnJU4HrEB9ZIKRzzQBbCHIQ/exec';

  // --- DOM要素 ---
  var loginScreen = document.getElementById('loginScreen');
  var loginShopIdInput = document.getElementById('loginShopId');
  var loginPasswordInput = document.getElementById('loginPassword');
  var loginBtn = document.getElementById('loginBtn');
  var loginSpinner = document.getElementById('loginSpinner');
  var loginError = document.getElementById('loginError');
  var mainScreen = document.getElementById('mainScreen');
  var shopNameDisplay = document.getElementById('shopNameDisplay');
  var logoutBtn = document.getElementById('logoutBtn');
  var refreshFoldersBtn = document.getElementById('refreshFolders');
  var folderTree = document.getElementById('folderTree');
  var dropZone = document.getElementById('dropZone');
  var fileInput = document.getElementById('fileInput');
  var queueSection = document.getElementById('queueSection');
  var uploadQueue = document.getElementById('uploadQueue');
  var startUploadBtn = document.getElementById('startUpload');
  var progressEl = document.getElementById('progress');
  var progressFill = document.getElementById('progressFill');
  var progressText = document.getElementById('progressText');
  var existingSection = document.getElementById('existingSection');
  var existingTitle = document.getElementById('existingTitle');
  var existingFiles = document.getElementById('existingFiles');

  var MAX_FILE_SIZE = 2 * 1024 * 1024;
  var UPLOAD_INTERVAL = 400;

  var queue = [];
  var selectedFolderId = null;

  // --- スピナーヘルパー ---
  function showSpinner(container, message) {
    container.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div><span>'
      + (message || '読み込み中...') + '</span></div>';
  }

  // --- フラットリストからツリー構造を構築 ---
  function buildFolderTree(flatList) {
    flatList.sort(function (a, b) {
      return (a.folderPath || '').split(/[\\\/]/).length - (b.folderPath || '').split(/[\\\/]/).length;
    });
    var pathMap = {};
    flatList.forEach(function (f) {
      if (f.folderPath) {
        pathMap[f.folderPath.replace(/\\/g, '/')] = f.folderId;
      }
    });
    var nodeMap = {};
    var roots = [];
    flatList.forEach(function (f) {
      var node = { folderId: f.folderId, folderName: f.folderName, folderPath: f.folderPath, children: [] };
      nodeMap[f.folderId] = node;
      var np = (f.folderPath || '').replace(/\\/g, '/');
      var lastSlash = np.lastIndexOf('/');
      var parentPath = lastSlash > 0 ? np.substring(0, lastSlash) : '';
      var parentId = parentPath ? pathMap[parentPath] : null;
      if (parentId && nodeMap[parentId]) {
        nodeMap[parentId].children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  // --- ツリー開閉状態の保存/復元 ---
  function getTreeState() {
    try {
      return JSON.parse(sessionStorage.getItem('treeState') || '{}');
    } catch (e) { return {}; }
  }

  function saveTreeState(folderId, open) {
    var state = getTreeState();
    state[folderId] = open;
    sessionStorage.setItem('treeState', JSON.stringify(state));
  }

  function getToken() {
    return sessionStorage.getItem('token') || '';
  }

  // --- 初期化 ---
  function init() {
    var token = getToken();
    var shopName = sessionStorage.getItem('shopName') || '';
    if (token) {
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
    loginSpinner.style.display = 'none';
  }

  function showMainScreen(shopName) {
    loginScreen.hidden = true;
    mainScreen.hidden = false;
    shopNameDisplay.textContent = shopName;
    loadFolders();
  }

  // --- ログイン ---
  loginBtn.addEventListener('click', doLogin);
  loginPasswordInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doLogin();
  });

  async function doLogin() {
    var shopId = loginShopIdInput.value.trim();
    var password = loginPasswordInput.value;
    if (!shopId || !password) {
      loginError.textContent = 'IDとパスワードを入力してください';
      loginError.style.display = 'block';
      return;
    }

    loginBtn.disabled = true;
    loginError.style.display = 'none';
    loginSpinner.style.display = '';

    try {
      var result = await gasGet('login', {
        shopId: shopId,
        password: password
      }, 15000);

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
      loginError.textContent = e.message || '通信エラー';
      loginError.style.display = 'block';
    }
    loginBtn.disabled = false;
    loginSpinner.style.display = 'none';
  }

  // --- ログアウト ---
  logoutBtn.addEventListener('click', function () {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('shopName');
    selectedFolderId = null;
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
  var JSONP_TIMEOUT = 60000; // 60秒

  function gasGet(action, params, timeout) {
    var ms = timeout || JSONP_TIMEOUT;
    return new Promise(function (resolve, reject) {
      var cbName = '_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      var done = false;
      var qs = 'action=' + encodeURIComponent(action)
        + '&callback=' + cbName
        + '&token=' + encodeURIComponent(getToken());
      if (params) {
        for (var k in params) {
          qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }
      }
      var url = GAS_URL + '?' + qs;

      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error('タイムアウトしました'));
      }, ms);

      window[cbName] = function (data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        resolve(data);
      };

      var script = document.createElement('script');
      script.src = url;
      script.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error('JSONP request failed'));
      };
      document.head.appendChild(script);
    });
  }

  async function gasPost(body) {
    body.token = getToken();
    var res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error('GAS request failed: ' + res.status);
    }
    return res.json();
  }

  // --- フォルダツリー ---
  async function loadFolders() {
    showSpinner(folderTree, '読み込み中...');
    try {
      var data = await gasGet('getFolders');
      if (checkAuthRequired(data)) return;
      folderTree.innerHTML = '';
      if (data.folders && data.folders.length > 0) {
        var tree = buildFolderTree(data.folders);
        renderTreeNodes(tree, folderTree, 0);
      } else {
        folderTree.innerHTML = '<p class="tree-loading">フォルダなし</p>';
      }
    } catch (e) {
      folderTree.innerHTML = '<p class="tree-loading" style="color:#e00">取得失敗</p>';
    }
  }

  function renderTreeNodes(nodes, container, depth) {
    var treeState = getTreeState();

    nodes.forEach(function (f) {
      var hasChildren = f.children && f.children.length > 0;

      // フォルダアイテム行
      var item = document.createElement('div');
      item.className = 'folder-item';
      item.setAttribute('data-folder-id', f.folderId);
      item.style.paddingLeft = (8 + depth * 16) + 'px';

      // トグル
      var toggle = document.createElement('span');
      toggle.className = 'folder-toggle';
      if (hasChildren) {
        var isOpen = treeState[f.folderId] !== false; // デフォルト開
        toggle.textContent = isOpen ? '\u25BC' : '\u25B6';
      }
      item.appendChild(toggle);

      // アイコン
      var icon = document.createElement('span');
      icon.className = 'folder-icon';
      icon.textContent = '\uD83D\uDCC1';
      item.appendChild(icon);

      // 名前
      var name = document.createElement('span');
      name.className = 'folder-name';
      name.textContent = f.folderName;
      item.appendChild(name);

      // 選択ハイライト復元
      if (f.folderId === selectedFolderId) {
        item.classList.add('active');
      }

      container.appendChild(item);

      // 子コンテナ
      var childContainer = null;
      if (hasChildren) {
        childContainer = document.createElement('div');
        childContainer.className = 'folder-children';
        var isOpen2 = treeState[f.folderId] !== false;
        if (isOpen2) childContainer.classList.add('open');
        container.appendChild(childContainer);
        renderTreeNodes(f.children, childContainer, depth + 1);
      }

      // クリックイベント
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        selectFolder(f.folderId, f.folderName);
      });

      // トグルクリック
      if (hasChildren) {
        toggle.addEventListener('click', function (e) {
          e.stopPropagation();
          var open = childContainer.classList.toggle('open');
          toggle.textContent = open ? '\u25BC' : '\u25B6';
          saveTreeState(f.folderId, open);
        });
      }
    });
  }

  function selectFolder(folderId, folderName) {
    selectedFolderId = folderId;

    var items = folderTree.querySelectorAll('.folder-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove('active');
    }
    var active = folderTree.querySelector('[data-folder-id="' + folderId + '"]');
    if (active) active.classList.add('active');

    loadFolderFiles(folderId, folderName);
    renderQueue();
  }

  refreshFoldersBtn.addEventListener('click', loadFolders);

  // --- フォルダ内画像一覧 ---
  async function loadFolderFiles(folderId, folderName) {
    existingSection.hidden = false;
    if (folderName) {
      existingTitle.textContent = folderName + ' の画像';
    }
    showSpinner(existingFiles, '画像を読み込み中...');
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
    startUploadBtn.disabled = !hasPending || !selectedFolderId;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  }

  // --- アップロード ---
  startUploadBtn.addEventListener('click', startUpload);

  async function startUpload() {
    if (!selectedFolderId) return;

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
          folderId: parseInt(selectedFolderId),
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

    loadFolderFiles(selectedFolderId);
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

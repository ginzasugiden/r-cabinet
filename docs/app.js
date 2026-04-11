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
  var clickZone = document.getElementById('clickZone');
  var pasteZone = document.getElementById('pasteZone');
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
  var imageDetail = document.getElementById('imageDetail');
  var detailPreview = document.getElementById('detailPreview');
  var detailFileName = document.getElementById('detailFileName');
  var detailFilePath = document.getElementById('detailFilePath');
  var detailFileSize = document.getElementById('detailFileSize');
  var detailDimensions = document.getElementById('detailDimensions');
  var detailTimeStamp = document.getElementById('detailTimeStamp');
  var detailFileUrl = document.getElementById('detailFileUrl');
  var copyUrlBtn = document.getElementById('copyUrlBtn');
  var detailClose = document.getElementById('detailClose');
  var toast = document.getElementById('toast');
  var sortSelect = document.getElementById('sortSelect');
  var limitSelect = document.getElementById('limitSelect');
  var filesCount = document.getElementById('filesCount');
  var pagination = document.getElementById('pagination');
  var paginationBottom = document.getElementById('paginationBottom');

  var MAX_FILE_SIZE = 2 * 1024 * 1024;
  var UPLOAD_INTERVAL = 400;

  var queue = [];
  var selectedFolderId = null;
  var selectedFolderName = null;
  var currentPage = 1;
  var allFilesCache = null; // ソート用の全件キャッシュ
  var allFilesCacheFolderId = null;

  // --- スピナーヘルパー ---
  function showSpinner(container, message) {
    container.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div><span>'
      + (message || '読み込み中...') + '</span></div>';
  }

  // --- フラットリストからツリー構造を構築（FolderPathベース） ---
  function buildFolderTree(flatList) {
    // デバッグ: フォルダ一覧をコンソールに出力
    console.log('=== フォルダ一覧 (' + flatList.length + '件) ===');
    console.log("全フォルダ:\n" + flatList.map(function (f) {
      var depth = (f.folderPath || '').split('/').length;
      var indent = '';
      for (var i = 1; i < depth; i++) indent += '  ';
      return depth + ' ' + indent + f.folderName + ' (ID:' + f.folderId + ', Path:' + f.folderPath + ')';
    }).join('\n'));

    // FolderPathでマップを作る
    var pathMap = {};
    flatList.forEach(function (f) {
      pathMap[f.folderPath] = { folderId: f.folderId, folderName: f.folderName, folderPath: f.folderPath, children: [] };
    });

    var roots = [];

    flatList.forEach(function (f) {
      var node = pathMap[f.folderPath];
      var parts = (f.folderPath || '').split('/');

      if (parts.length === 1) {
        // ルートフォルダ
        roots.push(node);
      } else {
        // 親のパスを求める
        var parentPath = parts.slice(0, -1).join('/');
        if (pathMap[parentPath]) {
          pathMap[parentPath].children.push(node);
        } else {
          // 親が見つからない場合はルートに追加
          roots.push(node);
        }
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

  // --- POST via popup window + CacheService polling ---
  async function gasPost(fields) {
    var uploadId = Date.now() + '_' + Math.random().toString(36).substr(2);
    fields.token = getToken();
    fields.uploadId = uploadId;

    // ポップアップを開いてフォーム送信
    var popup = window.open('', 'uploadPopup', 'width=400,height=200');

    var form = document.createElement('form');
    form.method = 'POST';
    form.action = GAS_URL;
    form.target = 'uploadPopup';
    form.style.display = 'none';

    for (var key in fields) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = fields[key];
      form.appendChild(input);
    }

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);

    // 3秒待ってからポーリング開始
    await sleep(3000);

    for (var i = 0; i < 30; i++) {
      try {
        var result = await gasGet('getUploadResult', { uploadId: uploadId });
        if (result.status !== 'pending') {
          if (popup && !popup.closed) popup.close();
          return result;
        }
      } catch (e) {
        // ポーリング中のエラーは無視して継続
      }
      await sleep(2000);
    }

    if (popup && !popup.closed) popup.close();
    throw new Error('アップロード結果の取得がタイムアウトしました');
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
    selectedFolderName = folderName;
    console.log('★フォルダ選択:', selectedFolderId, 'typeof:', typeof selectedFolderId, 'folderName:', folderName);
    currentPage = 1;
    allFilesCache = null;
    allFilesCacheFolderId = null;

    var items = folderTree.querySelectorAll('.folder-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove('active');
    }
    var active = folderTree.querySelector('[data-folder-id="' + folderId + '"]');
    if (active) active.classList.add('active');

    loadFolderFiles();
    renderQueue();
  }

  refreshFoldersBtn.addEventListener('click', loadFolders);

  sortSelect.addEventListener('change', function () {
    currentPage = 1;
    allFilesCache = null;
    allFilesCacheFolderId = null;
    loadFolderFiles();
  });

  limitSelect.addEventListener('change', function () {
    currentPage = 1;
    loadFolderFiles();
  });

  // --- フォルダ内画像一覧 ---
  function isDefaultSort() {
    return sortSelect.value === 'date_desc';
  }

  function getLimit() {
    return parseInt(limitSelect.value) || 20;
  }

  async function loadFolderFiles() {
    if (!selectedFolderId) return;
    existingSection.hidden = false;
    imageDetail.hidden = true;
    pagination.innerHTML = '';
    paginationBottom.innerHTML = '';
    filesCount.textContent = '';
    showSpinner(existingFiles, '画像を読み込み中...');

    try {
      if (isDefaultSort()) {
        // APIのデフォルト順 → offset/limit でサーバーページング
        var limit = getLimit();
        var offset = currentPage;
        var data = await gasGet('getFolderFiles', {
          folderId: selectedFolderId,
          offset: offset,
          limit: limit
        });
        if (checkAuthRequired(data)) return;
        var totalCount = parseInt(data.fileAllCount || 0);
        renderFilesList(data.files || [], totalCount, currentPage, limit);
      } else {
        // カスタムソート → 全件取得してフロントでソート+ページング
        var allFiles = await fetchAllFiles(selectedFolderId);
        if (allFiles === null) return; // auth error
        sortFiles(allFiles, sortSelect.value);
        var limit2 = getLimit();
        var start = (currentPage - 1) * limit2;
        var pageFiles = allFiles.slice(start, start + limit2);
        renderFilesList(pageFiles, allFiles.length, currentPage, limit2);
      }
    } catch (e) {
      existingFiles.innerHTML = '<p style="color:#e00">取得失敗</p>';
    }
  }

  async function fetchAllFiles(folderId) {
    // キャッシュがあればそれを使う
    if (allFilesCache && allFilesCacheFolderId === folderId) {
      return allFilesCache;
    }

    var allFiles = [];
    var offset = 1;
    var totalCount = null;

    while (true) {
      existingFiles.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div><span>全画像を読み込み中... '
        + allFiles.length + (totalCount ? '/' + totalCount : '') + '件</span></div>';

      var data = await gasGet('getFolderFiles', {
        folderId: folderId,
        offset: offset,
        limit: 100
      });
      if (checkAuthRequired(data)) return null;

      if (totalCount === null) {
        totalCount = parseInt(data.fileAllCount || 0);
      }
      allFiles = allFiles.concat(data.files || []);

      if (allFiles.length >= totalCount) break;
      offset++;
    }

    allFilesCache = allFiles;
    allFilesCacheFolderId = folderId;
    return allFiles;
  }

  function sortFiles(files, sortKey) {
    files.sort(function (a, b) {
      switch (sortKey) {
        case 'date_asc':
          return (a.TimeStamp || '').localeCompare(b.TimeStamp || '');
        case 'name_asc':
          return (a.FileName || '').localeCompare(b.FileName || '');
        case 'name_desc':
          return (b.FileName || '').localeCompare(a.FileName || '');
        case 'path_asc':
          return (a.FilePath || '').localeCompare(b.FilePath || '');
        case 'path_desc':
          return (b.FilePath || '').localeCompare(a.FilePath || '');
        case 'size_desc':
          return parseInt(b.FileSize || 0) - parseInt(a.FileSize || 0);
        case 'size_asc':
          return parseInt(a.FileSize || 0) - parseInt(b.FileSize || 0);
        default:
          return 0;
      }
    });
  }

  function renderFilesList(files, totalCount, page, limit) {
    existingFiles.innerHTML = '';

    var start = (page - 1) * limit + 1;
    var end = Math.min(start + files.length - 1, totalCount);
    filesCount.textContent = totalCount > 0
      ? start + '〜' + end + '件 (全' + totalCount + '件)'
      : '0件';

    if (files.length > 0) {
      files.forEach(function (f) {
        var img = document.createElement('img');
        img.src = f.FileUrl || f.fileUrl || '';
        img.alt = f.FileName || f.fileName || '';
        img.title = f.FileName || f.fileName || '';
        img.className = 'existing-thumb';
        img.addEventListener('click', function () {
          var thumbs = existingFiles.querySelectorAll('.existing-thumb');
          for (var i = 0; i < thumbs.length; i++) thumbs[i].classList.remove('selected');
          img.classList.add('selected');
          showImageDetail(f);
        });
        existingFiles.appendChild(img);
      });
    } else {
      existingFiles.innerHTML = '<p style="color:#999">画像なし</p>';
    }

    renderPagination(totalCount, page, limit);
  }

  function renderPagination(totalCount, page, limit) {
    var totalPages = Math.ceil(totalCount / limit);
    pagination.innerHTML = '';
    paginationBottom.innerHTML = '';
    if (totalPages <= 1) return;

    function createBtns(container) {
      // 前へ
      var prev = document.createElement('button');
      prev.className = 'page-btn';
      prev.textContent = '<';
      prev.disabled = page <= 1;
      prev.addEventListener('click', function () { goToPage(page - 1); });
      container.appendChild(prev);

      // ページ番号（最大7個表示）
      var startP = Math.max(1, page - 3);
      var endP = Math.min(totalPages, startP + 6);
      if (endP - startP < 6) startP = Math.max(1, endP - 6);

      for (var i = startP; i <= endP; i++) {
        var btn = document.createElement('button');
        btn.className = 'page-btn' + (i === page ? ' active' : '');
        btn.textContent = i;
        btn.addEventListener('click', (function (p) {
          return function () { goToPage(p); };
        })(i));
        container.appendChild(btn);
      }

      // 次へ
      var next = document.createElement('button');
      next.className = 'page-btn';
      next.textContent = '>';
      next.disabled = page >= totalPages;
      next.addEventListener('click', function () { goToPage(page + 1); });
      container.appendChild(next);
    }

    createBtns(pagination);
    createBtns(paginationBottom);
  }

  function goToPage(p) {
    currentPage = p;
    loadFolderFiles();
    // スクロールを画像一覧先頭に
    existingSection.scrollIntoView({ behavior: 'smooth' });
  }

  // --- 画像詳細表示 ---
  function showImageDetail(f) {
    var url = f.FileUrl || f.fileUrl || '';
    var name = f.FileName || f.fileName || '';
    var path = f.FilePath || f.filePath || '';
    var size = parseInt(f.FileSize || f.fileSize || 0);
    var w = f.Width || f.width || '';
    var h = f.Height || f.height || '';
    var ts = f.TimeStamp || f.timeStamp || f.RegisterDate || '';

    detailPreview.src = url;
    detailFileName.textContent = name;
    detailFilePath.textContent = path;
    detailFileSize.textContent = formatSize(size);
    detailDimensions.textContent = (w && h) ? w + ' x ' + h + ' px' : '-';
    detailTimeStamp.textContent = ts || '-';
    detailFileUrl.textContent = url;
    imageDetail.hidden = false;
  }

  detailClose.addEventListener('click', function () {
    imageDetail.hidden = true;
    var thumbs = existingFiles.querySelectorAll('.existing-thumb');
    for (var i = 0; i < thumbs.length; i++) thumbs[i].classList.remove('selected');
  });

  copyUrlBtn.addEventListener('click', function () {
    var url = detailFileUrl.textContent;
    if (!url) return;
    navigator.clipboard.writeText(url).then(function () {
      showToast('コピーしました');
    });
  });

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function () {
      toast.classList.remove('show');
    }, 2000);
  }

  // --- 左: ドラッグ&ドロップ専用 ---
  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('active');
  });

  dropZone.addEventListener('dragleave', function () {
    dropZone.classList.remove('active');
  });

  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('active');
    console.log('★ドロップ: selectedFolderId =', selectedFolderId);
    if (!selectedFolderId) { alert('フォルダを選択してください'); return; }
    addFiles(e.dataTransfer.files);
  });

  // --- 中央: クリックして選択専用 ---
  clickZone.addEventListener('click', function () {
    if (!selectedFolderId) { alert('フォルダを選択してください'); return; }
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  // --- 右: ペースト専用 ---
  var pastePreview = document.getElementById('pastePreview');
  var pastePreviewImg = document.getElementById('pastePreviewImg');
  var pasteFileName = document.getElementById('pasteFileName');
  var pasteFileExt = document.getElementById('pasteFileExt');
  var pasteUploadBtn = document.getElementById('pasteUploadBtn');
  var pasteCancelBtn = document.getElementById('pasteCancelBtn');
  var pasteHint = pasteZone.querySelector('.paste-hint');
  var pendingPasteFile = null;

  pasteZone.addEventListener('paste', function (e) {
    e.preventDefault();
    console.log('★ペーストイベント発火: selectedFolderId =', selectedFolderId, 'typeof:', typeof selectedFolderId);
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var imageFile = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageFile = items[i].getAsFile();
        if (imageFile) break;
      }
    }
    if (!imageFile) return;
    if (!selectedFolderId) { alert('フォルダを選択してください（selectedFolderId=' + selectedFolderId + '）'); return; }

    // 拡張子とデフォルトファイル名を生成
    var ext = imageFile.type.split('/')[1] || 'png';
    if (ext === 'jpeg') ext = 'jpg';
    var now = new Date();
    var ts = now.getFullYear()
      + ('0' + (now.getMonth() + 1)).slice(-2)
      + ('0' + now.getDate()).slice(-2)
      + ('0' + now.getHours()).slice(-2)
      + ('0' + now.getMinutes()).slice(-2)
      + ('0' + now.getSeconds()).slice(-2);
    var defaultName = 'paste_' + ts;

    // プレビュー表示
    pendingPasteFile = imageFile;
    var reader = new FileReader();
    reader.onload = function (ev) {
      pastePreviewImg.src = ev.target.result;
    };
    reader.readAsDataURL(imageFile);
    pasteFileName.value = defaultName;
    pasteFileExt.textContent = '.' + ext;
    pasteHint.hidden = true;
    pastePreview.hidden = false;
    pasteZone.classList.add('has-preview');
  });

  pasteUploadBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    console.log('★ペーストアップロード: selectedFolderId =', selectedFolderId);
    if (!pendingPasteFile) return;
    if (!selectedFolderId) { alert('フォルダを選択してください'); return; }
    var name = pasteFileName.value.trim() || 'paste_image';
    var ext = pasteFileExt.textContent;
    var renamed = new File([pendingPasteFile], name + ext, { type: pendingPasteFile.type });
    addFiles([renamed]);
    clearPastePreview();
  });

  pasteCancelBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    clearPastePreview();
  });

  function clearPastePreview() {
    pendingPasteFile = null;
    pastePreviewImg.src = '';
    pasteFileName.value = '';
    pastePreview.hidden = true;
    pasteHint.hidden = false;
    pasteZone.classList.remove('has-preview');
  }

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

    allFilesCache = null;
    allFilesCacheFolderId = null;
    loadFolderFiles();
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

/**
 * R-Cabinet GAS Web App - メインエントリ
 */

function doGet(e) {
  try {
    var action = (e && e.parameter) ? e.parameter.action : '';
    var result;

    if (action === 'login') {
      result = login(e.parameter.shopId, e.parameter.password);
    } else if (action === 'getFolders') {
      var auth = authenticate(e.parameter.token);
      if (auth.error) return jsonResponse(auth, e);
      result = getFolders(auth.shopId);
    } else if (action === 'getFolderFiles') {
      var auth2 = authenticate(e.parameter.token);
      if (auth2.error) return jsonResponse(auth2, e);
      var folderId = e.parameter.folderId;
      if (!folderId) {
        return jsonResponse({ error: 'folderId is required' }, e);
      }
      var offset = e.parameter.offset || '1';
      var limit = e.parameter.limit || '20';
      result = getFolderFiles(auth2.shopId, folderId, offset, limit);
    } else if (action === 'getUploadResult') {
      var uploadId = e.parameter.uploadId;
      if (!uploadId) {
        return jsonResponse({ error: 'uploadId is required' }, e);
      }
      var cached = CacheService.getScriptCache().get('upload_' + uploadId);
      result = cached ? JSON.parse(cached) : { status: 'pending' };
    } else {
      return jsonResponse({ error: 'Unknown action: ' + action }, e);
    }

    return jsonResponse(result, e);
  } catch (err) {
    return jsonResponse({ error: String(err) }, e);
  }
}

function doPost(e) {
  var result;
  var uploadId;
  try {
    var params = e.parameter || {};
    var action = params.action;
    uploadId = params.uploadId;

    if (action === 'uploadFile') {
      var auth = authenticate(params.token);
      if (auth.error) {
        result = auth;
      } else {
        var body = {
          shopId: auth.shopId,
          folderId: params.folderId,
          fileName: params.fileName,
          fileData: params.fileData,
          mimeType: params.mimeType,
          originalFileName: params.originalFileName
        };
        result = uploadFile(body);
      }
    } else {
      result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: String(err) };
  }

  // 結果をCacheServiceに保存
  if (uploadId) {
    CacheService.getScriptCache().put('upload_' + uploadId, JSON.stringify(result), 300);
  }

  return HtmlService.createHtmlOutput(
    '<html><body style="font-family:sans-serif;padding:20px;text-align:center">' +
    '<p>アップロード完了。このウィンドウを閉じてください。</p>' +
    '</body></html>'
  );
}

/**
 * トークン認証
 */
function authenticate(token) {
  if (!token) {
    return { error: '認証が必要です', authRequired: true };
  }
  var cache = CacheService.getScriptCache();
  var shopId = cache.get('session_' + token);
  if (!shopId) {
    return { error: '認証が必要です', authRequired: true };
  }
  return { shopId: shopId };
}

function jsonResponse(data, e) {
  var jsonStr = JSON.stringify(data);
  var callback = (e && e.parameter) ? e.parameter.callback : null;
  if (callback) {
    // JSON文字列をエスケープして安全にJSに埋め込む
    var escaped = jsonStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    return ContentService
      .createTextOutput(callback + "(JSON.parse('" + escaped + "'))")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(jsonStr)
    .setMimeType(ContentService.MimeType.JSON);
}

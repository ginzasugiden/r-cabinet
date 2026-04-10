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
      result = getFolderFiles(auth2.shopId, folderId);
    } else if (action === 'getUploadResult') {
      var uploadId = e.parameter.uploadId;
      if (!uploadId) {
        return jsonResponse({ error: 'uploadId is required' }, e);
      }
      var cached = CacheService.getScriptCache().get('upload_' + uploadId);
      if (cached) {
        result = JSON.parse(cached);
      } else {
        result = { pending: true };
      }
    } else {
      return jsonResponse({ error: 'Unknown action: ' + action }, e);
    }

    return jsonResponse(result, e);
  } catch (err) {
    return jsonResponse({ error: String(err) }, e);
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === 'uploadFile') {
      var uploadId = body.uploadId;
      var auth = authenticate(body.token);
      var result;
      if (auth.error) {
        result = auth;
      } else {
        body.shopId = auth.shopId;
        result = uploadFile(body);
      }
      if (uploadId) {
        CacheService.getScriptCache().put('upload_' + uploadId, JSON.stringify(result), 300);
      }
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
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
    return ContentService
      .createTextOutput(callback + '(' + jsonStr + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(jsonStr)
    .setMimeType(ContentService.MimeType.JSON);
}

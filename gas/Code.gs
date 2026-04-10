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
    // form submit から受け取る（e.parameter にフィールドが入る）
    var params = e.parameter || {};
    var action = params.action;

    if (action === 'uploadFile') {
      var auth = authenticate(params.token);
      if (auth.error) return htmlPostMessage(auth);
      var body = {
        shopId: auth.shopId,
        folderId: params.folderId,
        fileName: params.fileName,
        fileData: params.fileData,
        mimeType: params.mimeType,
        originalFileName: params.originalFileName
      };
      var result = uploadFile(body);
      return htmlPostMessage(result);
    } else {
      return htmlPostMessage({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return htmlPostMessage({ error: String(err) });
  }
}

function htmlPostMessage(data) {
  var jsonStr = JSON.stringify(data);
  var html = '<html><body><script>window.parent.postMessage(' + jsonStr + ', "*");<\/script></body></html>';
  return HtmlService.createHtmlOutput(html);
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

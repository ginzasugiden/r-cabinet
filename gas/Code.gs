/**
 * R-Cabinet GAS Web App - メインエントリ
 */

function doGet(e) {
  try {
    var action = (e && e.parameter) ? e.parameter.action : '';
    var result;

    if (action === 'getShops') {
      result = getShops();
    } else if (action === 'getFolders') {
      var shopId = e.parameter.shopId;
      if (!shopId) {
        return jsonResponse({ error: 'shopId is required' }, e);
      }
      result = getFolders(shopId);
    } else if (action === 'getFolderFiles') {
      var shopId2 = e.parameter.shopId;
      var folderId = e.parameter.folderId;
      if (!shopId2) {
        return jsonResponse({ error: 'shopId is required' }, e);
      }
      if (!folderId) {
        return jsonResponse({ error: 'folderId is required' }, e);
      }
      result = getFolderFiles(shopId2, folderId);
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
      var result = uploadFile(body);
      return jsonResponse(result);
    } else {
      return jsonResponse({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonResponse({ error: String(err) });
  }
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

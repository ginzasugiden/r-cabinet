/**
 * R-Cabinet GAS Web App - メインエントリ
 */

function doGet(e) {
  try {
    var action = (e && e.parameter) ? e.parameter.action : '';
    var result;

    if (action === 'getFolders') {
      result = getFolders();
    } else if (action === 'getFolderFiles') {
      var folderId = e.parameter.folderId;
      if (!folderId) {
        return jsonResponse({ error: 'folderId is required' });
      }
      result = getFolderFiles(folderId);
    } else {
      return jsonResponse({ error: 'Unknown action: ' + action });
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: String(err) });
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

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

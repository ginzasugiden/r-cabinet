/**
 * R-Cabinet GAS Web App - メインエントリ
 */

function doGet(e) {
  const action = e.parameter.action;

  try {
    let result;
    switch (action) {
      case 'getFolders':
        result = getFolders();
        break;
      case 'getFolderFiles':
        const folderId = e.parameter.folderId;
        if (!folderId) {
          return jsonResponse({ error: 'folderId is required' }, 400);
        }
        result = getFolderFiles(folderId);
        break;
      default:
        return jsonResponse({ error: 'Unknown action: ' + action }, 400);
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    switch (action) {
      case 'uploadFile':
        const result = uploadFile(body);
        return jsonResponse(result);
      default:
        return jsonResponse({ error: 'Unknown action: ' + action }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function jsonResponse(data, status) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

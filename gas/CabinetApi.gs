/**
 * R-Cabinet GAS - Cabinet API呼び出しロジック
 */

const CABINET_API_BASE = 'https://api.rms.rakuten.co.jp/es/1.0/cabinet';

const SPREADSHEET_ID = '1iYeV2SbOVoRH8Qjm2d1w5tWmhlE_zcc-yO1tDSLN7Rk';
const SHEET_NAME = 'api_key';

/**
 * ログイン認証
 */
function login(shopId, password) {
  if (!shopId || !password) {
    return { success: false, error: 'IDとパスワードを入力してください' };
  }
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  var data = sheet.getDataRange().getValues();

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === shopId) {
      var pwRaw = String(data[i][5]).replace(/^BASE64:/, '');
      var storedPw = Utilities.newBlob(Utilities.base64Decode(pwRaw)).getDataAsString();
      if (password !== storedPw) {
        return { success: false, error: 'IDまたはパスワードが違います' };
      }
      var shopName = String(data[i][7]).trim() || shopId;
      var token = Utilities.getUuid();
      CacheService.getScriptCache().put('session_' + token, shopId, 21600);
      return { success: true, token: token, shopName: shopName };
    }
  }
  return { success: false, error: 'IDまたはパスワードが違います' };
}

/**
 * スプレッドシートからAPIキーを取得しデコード
 */
function getApiKeys(shopId) {
  if (!shopId) {
    throw new Error('shopId is required');
  }
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === shopId) {
      var licenseKeyRaw = String(data[i][2]).replace(/^BASE64:/, '');
      var serviceSecretRaw = String(data[i][3]).replace(/^BASE64:/, '');
      var licenseKey = Utilities.newBlob(Utilities.base64Decode(licenseKeyRaw)).getDataAsString();
      var serviceSecret = Utilities.newBlob(Utilities.base64Decode(serviceSecretRaw)).getDataAsString();
      return { serviceSecret: serviceSecret, licenseKey: licenseKey };
    }
  }
  throw new Error('API key row not found for shopId: ' + shopId);
}

/**
 * 認証ヘッダーを生成
 */
function getAuthHeader(shopId) {
  var keys = getApiKeys(shopId);
  var encoded = Utilities.base64Encode(keys.serviceSecret + ':' + keys.licenseKey);
  return 'ESA ' + encoded;
}

/**
 * フォルダ一覧取得（ページング対応・全件取得）
 */
function getFolders(shopId) {
  var allFolders = [];
  var offset = 1;
  var limit = 100;
  var totalCount = null;
  var authHeader = getAuthHeader(shopId);

  while (true) {
    var url = CABINET_API_BASE + '/folders/get?offset=' + offset + '&limit=' + limit;
    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { 'Authorization': authHeader },
      muteHttpExceptions: true
    });

    var xml = response.getContentText();
    var parsed = parseFoldersPage(xml);

    if (parsed.error) {
      return parsed;
    }

    if (totalCount === null) {
      totalCount = parsed.folderAllCount;
    }

    allFolders = allFolders.concat(parsed.folders);

    if (allFolders.length >= totalCount) {
      break;
    }

    offset += limit;
    Utilities.sleep(600); // レート制限対策（秒間2リクエスト）
  }

  var tree = buildFolderTree(allFolders);

  return {
    status: 'success',
    resultCode: 'N000',
    folderAllCount: totalCount,
    folders: tree
  };
}

/**
 * フォルダ内画像一覧取得
 */
function getFolderFiles(shopId, folderId) {
  var url = CABINET_API_BASE + '/folder/files/get?folderId=' + folderId;
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'Authorization': getAuthHeader(shopId) },
    muteHttpExceptions: true
  });

  var xml = response.getContentText();
  return parseFolderFilesXml(xml);
}

/**
 * 画像アップロード
 */
function uploadFile(params) {
  var shopId = params.shopId;
  var folderId = params.folderId;
  var fileName = params.fileName;
  var fileData = params.fileData;
  var mimeType = params.mimeType;
  var originalFileName = params.originalFileName;
  var url = CABINET_API_BASE + '/file/insert';

  const xmlBody = '<request><fileInsertRequest><file>'
    + '<fileName>' + escapeXml(fileName) + '</fileName>'
    + '<folderId>' + folderId + '</folderId>'
    + '</file></fileInsertRequest></request>';

  const fileBytes = Utilities.base64Decode(fileData);
  const boundary = '----FormBoundary' + Utilities.getUuid();
  const payload = buildMultipart(boundary, xmlBody, fileBytes, originalFileName, mimeType);

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: { 'Authorization': getAuthHeader(shopId) },
    contentType: 'multipart/form-data; boundary=' + boundary,
    payload: payload,
    muteHttpExceptions: true
  });

  const xml = response.getContentText();
  return parseUploadResponseXml(xml);
}

/**
 * multipart/form-data をバイナリで手動構築
 */
function buildMultipart(boundary, xmlPart, fileBytes, fileName, mimeType) {
  const crlf = '\r\n';
  const xmlHeader = '--' + boundary + crlf
    + 'Content-Disposition: form-data; name="xml"' + crlf
    + 'Content-Type: application/xml; charset=utf-8' + crlf + crlf;
  const xmlFooter = crlf;
  const fileHeader = '--' + boundary + crlf
    + 'Content-Disposition: form-data; name="file"; filename="' + fileName + '"' + crlf
    + 'Content-Type: ' + mimeType + crlf + crlf;
  const fileFooter = crlf + '--' + boundary + '--' + crlf;

  const xmlHeaderBytes = Utilities.newBlob(xmlHeader).getBytes();
  const xmlPartBytes = Utilities.newBlob(xmlPart, 'application/xml').getBytes();
  const xmlFooterBytes = Utilities.newBlob(xmlFooter).getBytes();
  const fileHeaderBytes = Utilities.newBlob(fileHeader).getBytes();
  const fileFooterBytes = Utilities.newBlob(fileFooter).getBytes();

  const allBytes = [].concat(
    xmlHeaderBytes, xmlPartBytes, xmlFooterBytes,
    fileHeaderBytes, fileBytes, fileFooterBytes
  );

  return Utilities.newBlob(allBytes, 'multipart/form-data; boundary=' + boundary);
}

/**
 * XML特殊文字エスケープ
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// --- XML パース ---

function parseFoldersPage(xml) {
  var doc = XmlService.parse(xml);
  var root = doc.getRootElement();

  var status = root.getChildText('status');
  var resultNode = root.getChild('cabinetFoldersGetResult');

  if (!resultNode) {
    return { status: status, error: 'No result in response', raw: xml };
  }

  var resultCode = resultNode.getChildText('resultCode');
  var folderAllCount = parseInt(resultNode.getChildText('folderAllCount') || '0');
  var foldersNode = resultNode.getChild('folders');
  var folders = [];

  if (foldersNode) {
    var folderNodes = foldersNode.getChildren('folder');
    folderNodes.forEach(function(node) {
      folders.push({
        folderId: parseInt(node.getChildText('FolderId')),
        folderName: node.getChildText('FolderName'),
        folderPath: node.getChildText('FolderPath') || ''
      });
    });
  }

  return {
    status: status,
    resultCode: resultCode,
    folderAllCount: folderAllCount,
    folders: folders
  };
}

/**
 * フラットなフォルダリストからツリー構造を構築
 * FolderPath例: "\base", "\base\sub1", "\base\sub1\sub2"
 */
function buildFolderTree(flatList) {
  // パスの深さでソート
  flatList.sort(function(a, b) {
    return (a.folderPath || '').split(/[\\\/]/).length - (b.folderPath || '').split(/[\\\/]/).length;
  });

  // pathからfolderIdへのマップ
  var pathMap = {};
  flatList.forEach(function(f) {
    if (f.folderPath) {
      pathMap[f.folderPath.replace(/\\/g, '/')] = f.folderId;
    }
  });

  // folderIdからノードへのマップ
  var nodeMap = {};
  var roots = [];

  flatList.forEach(function(f) {
    var node = {
      folderId: f.folderId,
      folderName: f.folderName,
      folderPath: f.folderPath,
      children: []
    };
    nodeMap[f.folderId] = node;

    // 親パスを算出
    var normalizedPath = (f.folderPath || '').replace(/\\/g, '/');
    var lastSlash = normalizedPath.lastIndexOf('/');
    var parentPath = lastSlash > 0 ? normalizedPath.substring(0, lastSlash) : '';

    var parentId = parentPath ? pathMap[parentPath] : null;
    if (parentId && nodeMap[parentId]) {
      nodeMap[parentId].children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function parseFolderFilesXml(xml) {
  const doc = XmlService.parse(xml);
  const root = doc.getRootElement();

  const status = root.getChildText('status');
  const resultNode = root.getChild('cabinetFolderFilesGetResult');

  if (!resultNode) {
    return { status: status, error: 'No result in response', raw: xml };
  }

  const resultCode = resultNode.getChildText('resultCode');
  const fileAllCount = parseInt(resultNode.getChildText('fileAllCount') || '0');
  const filesNode = resultNode.getChild('files');
  const files = [];

  if (filesNode) {
    const fileNodes = filesNode.getChildren('file');
    fileNodes.forEach(function(node) {
      files.push({
        fileId: parseInt(node.getChildText('FileId') || '0'),
        fileName: node.getChildText('FileName'),
        fileUrl: node.getChildText('FileUrl'),
        fileSize: parseInt(node.getChildText('FileSize') || '0')
      });
    });
  }

  return {
    status: status,
    resultCode: resultCode,
    fileAllCount: fileAllCount,
    files: files
  };
}

function parseUploadResponseXml(xml) {
  const doc = XmlService.parse(xml);
  const root = doc.getRootElement();

  const status = root.getChildText('status');
  const resultNode = root.getChild('cabinetFileInsertResult');

  if (!resultNode) {
    return { status: status, error: 'No result in response', raw: xml };
  }

  const resultCode = resultNode.getChildText('resultCode');
  const fileNode = resultNode.getChild('file');
  const file = {};

  if (fileNode) {
    file.fileId = parseInt(fileNode.getChildText('FileId') || '0');
    file.fileName = fileNode.getChildText('FileName');
    file.fileUrl = fileNode.getChildText('FileUrl');
  }

  return {
    status: status,
    resultCode: resultCode,
    file: file
  };
}

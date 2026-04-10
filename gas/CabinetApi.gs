/**
 * R-Cabinet GAS - Cabinet API呼び出しロジック
 */

const CABINET_API_BASE = 'https://api.rms.rakuten.co.jp/es/1.0/cabinet';

const SPREADSHEET_ID = '1iYeV2SbOVoRH8Qjm2d1w5tWmhlE_zcc-yO1tDSLN7Rk';
const SHEET_NAME = 'api_key';
const TARGET_ID = 'tokyoflower';

/**
 * スプレッドシートからAPIキーを取得しデコード
 */
function getApiKeys() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === TARGET_ID) {
      const licenseKeyRaw = String(data[i][2]).replace(/^BASE64:/, '');
      const serviceSecretRaw = String(data[i][3]).replace(/^BASE64:/, '');
      const licenseKey = Utilities.newBlob(Utilities.base64Decode(licenseKeyRaw)).getDataAsString();
      const serviceSecret = Utilities.newBlob(Utilities.base64Decode(serviceSecretRaw)).getDataAsString();
      return { serviceSecret, licenseKey };
    }
  }
  throw new Error('API key row not found for id: ' + TARGET_ID);
}

/**
 * 認証ヘッダーを生成
 */
function getAuthHeader() {
  const { serviceSecret, licenseKey } = getApiKeys();
  const encoded = Utilities.base64Encode(serviceSecret + ':' + licenseKey);
  return 'ESA ' + encoded;
}

/**
 * フォルダ一覧取得
 */
function getFolders() {
  const url = CABINET_API_BASE + '/folders/get';
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'Authorization': getAuthHeader() },
    muteHttpExceptions: true
  });

  const xml = response.getContentText();
  return parseFoldersXml(xml);
}

/**
 * フォルダ内画像一覧取得
 */
function getFolderFiles(folderId) {
  const url = CABINET_API_BASE + '/folder/files/get?folderId=' + folderId;
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'Authorization': getAuthHeader() },
    muteHttpExceptions: true
  });

  const xml = response.getContentText();
  return parseFolderFilesXml(xml);
}

/**
 * 画像アップロード
 */
function uploadFile(params) {
  const { folderId, fileName, fileData, mimeType, originalFileName } = params;
  const url = CABINET_API_BASE + '/file/insert';

  const xmlBody = '<request><fileInsertRequest><file>'
    + '<fileName>' + escapeXml(fileName) + '</fileName>'
    + '<folderId>' + folderId + '</folderId>'
    + '</file></fileInsertRequest></request>';

  const fileBytes = Utilities.base64Decode(fileData);
  const boundary = '----FormBoundary' + Utilities.getUuid();
  const payload = buildMultipart(boundary, xmlBody, fileBytes, originalFileName, mimeType);

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: { 'Authorization': getAuthHeader() },
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

function parseFoldersXml(xml) {
  const doc = XmlService.parse(xml);
  const root = doc.getRootElement();

  const status = root.getChildText('status');
  const resultNode = root.getChild('cabinetFoldersGetResult');

  if (!resultNode) {
    return { status: status, error: 'No result in response', raw: xml };
  }

  const resultCode = resultNode.getChildText('resultCode');
  const folderAllCount = parseInt(resultNode.getChildText('folderAllCount') || '0');
  const foldersNode = resultNode.getChild('folders');
  const folders = [];

  if (foldersNode) {
    const folderNodes = foldersNode.getChildren('folder');
    folderNodes.forEach(function(node) {
      folders.push({
        folderId: parseInt(node.getChildText('FolderId')),
        folderName: node.getChildText('FolderName')
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

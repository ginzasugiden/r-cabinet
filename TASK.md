# R-Cabinet ドラッグ＆ドロップ画像アップローダー

## 概要
GitHub Pages + GAS で、楽天R-Cabinetに画像をドラッグ＆ドロップでアップロードできるWebツールを作成する。

## アカウント・環境
- **GitHub**: GSDアカウント（ginzasugiden）で管理。リポジトリ名: `r-cabinet`
- **GAS**: GSDのGoogleアカウントでclasp管理
- **GitHub Pages**: `docs/` ディレクトリから公開
- **ローカル作業ディレクトリ**: `X:\projects\r-cabinet`

## アーキテクチャ
```
[GitHub Pages (HTML/JS)] → [GAS (Web App)] → [楽天 Cabinet API]
```
- **フロントエンド**: GitHub Pages（HTML + vanilla JS）
- **バックエンド**: Google Apps Script（GAS Web App として公開、APIプロキシ）

## 使用する楽天 Cabinet API

### 認証
- Header: `Authorization: ESA Base64(serviceSecret:licenseKey)`
- GAS側でserviceSecret, licenseKeyをスクリプトプロパティに保存

### API一覧

| API | Method | Endpoint | 用途 |
|-----|--------|----------|------|
| cabinet.folders.get | GET | `https://api.rms.rakuten.co.jp/es/1.0/cabinet/folders/get` | フォルダ一覧取得 |
| cabinet.folder.files.get | GET | `https://api.rms.rakuten.co.jp/es/1.0/cabinet/folder/files/get?folderId={id}` | フォルダ内画像一覧 |
| cabinet.file.insert | POST | `https://api.rms.rakuten.co.jp/es/1.0/cabinet/file/insert` | 画像アップロード |

### cabinet.file.insert 仕様（重要）
- Content-Type: `multipart/form-data; boundary=...`
- Body: multipart形式で以下2パート
  - **xml パート**: `Content-Disposition: form-data; name="xml"` → XMLリクエストボディ
  - **file パート**: `Content-Disposition: form-data; name="file"; filename="ファイル名"` → バイナリ画像データ
- XML構造:
```xml
<request>
  <fileInsertRequest>
    <file>
      <fileName>登録画像名（50バイト以内）</fileName>
      <folderId>登録先フォルダID</folderId>
    </file>
  </fileInsertRequest>
</request>
```
- ファイル制限: 1ファイル2MBまで、横3840×縦3840pxまで
- 対応形式: JPEG, GIF, アニメーションGIF, PNG, TIFF, BMP（PNG/TIFF/BMPはJPEG変換）
- レート制限: 秒間最大3リクエスト

### cabinet.folders.get レスポンス（XML）
```xml
<result>
  <status>...</status>
  <cabinetFoldersGetResult>
    <resultCode>...</resultCode>
    <folderAllCount>...</folderAllCount>
    <folders>
      <folder>
        <FolderId>フォルダID</FolderId>
        <FolderName>フォルダ名</FolderName>
      </folder>
    </folders>
  </cabinetFoldersGetResult>
</result>
```
- offset/limit でページング（最大100件ずつ）
- レート制限: 秒間最大2リクエスト

### cabinet.folder.files.get パラメータ
- `folderId` (必須): フォルダID
- `offset`, `limit`: ページング（最大100件ずつ）
- レート制限: 秒間最大2リクエスト

## GAS 側の実装

### ファイル構成
```
gas/
├── Code.gs          # メインエントリ（doGet/doPost）
├── CabinetApi.gs    # Cabinet API呼び出しロジック
└── appsscript.json  # マニフェスト
```

### スクリプトプロパティ
- `SERVICE_SECRET`: RMS WEB SERVICE の serviceSecret
- `LICENSE_KEY`: RMS WEB SERVICE の licenseKey

### エンドポイント設計

#### GET（doGet）
クエリパラメータ `action` で分岐:
- `action=getFolders` → cabinet.folders.get を呼び、JSON変換して返す
- `action=getFolderFiles&folderId=XXX` → cabinet.folder.files.get を呼び、JSON変換して返す

#### POST（doPost）
- フロントから画像をBase64で送信
- GAS側でBase64デコード → multipart/form-data を手動構築 → cabinet.file.insert に送信
- POSTリクエストのJSON構造:
```json
{
  "action": "uploadFile",
  "folderId": 12345,
  "fileName": "画像表示名",
  "fileData": "Base64エンコード文字列",
  "mimeType": "image/jpeg",
  "originalFileName": "photo.jpg"
}
```

### multipart構築（GAS）
GASの `UrlFetchApp.fetch` では直接multipartを組めないため、バイナリで手動構築する:
```javascript
function buildMultipart(boundary, xmlPart, fileBlob) {
  // boundary区切りでXMLパートとfileパートを構築
  // Utilities.newBlob() でバイナリ結合
}
```

### XML→JSON変換
GASの `XmlService.parse()` でXMLレスポンスをパースし、JSONに変換してフロントに返す。

## フロントエンド側の実装

### ファイル構成
```
docs/
├── index.html       # メインページ（単一ファイル構成でもOK）
├── style.css
└── app.js
```

### 機能要件
1. **初期設定**: GAS Web App URLを入力・localStorage保存
2. **フォルダ一覧取得**: ページ読み込み時にGAS経由でフォルダ一覧を取得、セレクトボックスで表示
3. **フォルダ選択**: フォルダ選択時にフォルダ内の既存画像一覧を表示（サムネイル）
4. **ドラッグ＆ドロップ**: 
   - ドロップゾーンにファイルをD&D
   - 複数ファイル対応
   - プレビュー表示
   - ファイルサイズ（2MB）チェック
5. **アップロード実行**:
   - 選択フォルダに対してGAS経由でアップロード
   - 進捗表示（n/m件）
   - レート制限対策: 1件ごとに400msウェイト（秒間3リクエスト制限）
   - 成功/失敗をファイルごとに表示
6. **画像名の自動設定**: ファイル名（拡張子除く）をデフォルトの画像名とする。編集可能。

### UI構成
```
┌─────────────────────────────────────┐
│ R-Cabinet アップローダー             │
├─────────────────────────────────────┤
│ GAS URL: [________________] [保存]  │
├─────────────────────────────────────┤
│ フォルダ: [▼ フォルダ選択 ▼]        │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │   ここに画像をドラッグ＆ドロップ    │ │
│ │   またはクリックして選択          │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ アップロード待ち:                    │
│ [thumb] photo1.jpg  画像名:[___]    │
│ [thumb] photo2.jpg  画像名:[___]    │
│                    [アップロード開始] │
├─────────────────────────────────────┤
│ フォルダ内の既存画像:                │
│ [img][img][img][img]...             │
└─────────────────────────────────────┘
```

### CORS対策
GitHub Pages → GAS Web App はCORS問題なし（GASのdoGet/doPostはCORS許可済み）。
ただし、GASレスポンスは `ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON)` で返す。

## 開発手順
1. GASプロジェクトを作成し、clasp で管理
2. まず `getFolders` を実装・動作確認
3. `getFolderFiles` を実装・動作確認
4. `uploadFile`（multipart構築）を実装・動作確認
5. フロントエンドを構築（GitHub Pages の docs/ ディレクトリ）
6. 結合テスト

## 注意事項
- GASの実行時間制限: 6分（通常アカウント）。大量アップロード時は分割が必要。
- GASのPOSTペイロード上限: 約50MB。1ファイル2MB制限なので問題なし。
- Base64エンコードでデータ量が約1.33倍になる点を考慮。
- フロントエンド側でファイルサイズ2MBチェックを実装すること。
- XMLレスポンスのパースエラーハンドリングを丁寧に。

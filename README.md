# 異常報告管理システム

現場での異常報告をデジタル化・一元管理するWebアプリケーションです。

## 機能

- **報告登録** — 機器名・発生場所・異常内容・重要度・写真/動画をフォームから入力
- **一覧表示** — 全報告をテーブル形式で表示。機器名・場所・ステータスで絞り込み可能
- **ステータス管理** — 一覧画面からドロップダウンで即時変更（未対応 / 対応中 / 解決済み）
- **報告編集** — 登録後も内容・添付ファイルを編集可能
- **削除** — 不要な報告を削除
- **PDF出力** — 報告内容・添付画像を含むA4帳票を自動生成

## 技術構成

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 16 / React 19 / TypeScript / Tailwind CSS v4 |
| バックエンド | FastAPI / SQLAlchemy / SQLite |
| PDF生成 | ReportLab |
| デプロイ（フロント） | Vercel |
| デプロイ（バックエンド） | Railway |
| ファイル保存 | Railway Volume |

## ディレクトリ構成

```
anomaly-report/
├── backend/
│   ├── main.py              # FastAPI アプリ本体・CORS・静的ファイル配信
│   ├── database.py          # SQLAlchemy モデル・DB接続・セッション管理
│   ├── schemas.py           # Pydantic スキーマ（リクエスト/レスポンス型）
│   ├── crud.py              # DB操作（CRUD関数）
│   ├── pdf.py               # ReportLab による PDF 生成
│   ├── routers/
│   │   └── reports.py       # /reports エンドポイント群
│   ├── uploads/             # アップロードファイル保存先（ローカル）
│   ├── requirements.txt
│   ├── Procfile             # Railway 起動コマンド
│   └── railway.json         # Railway デプロイ設定
└── frontend/
    ├── app/
    │   ├── page.tsx                        # トップページ（報告一覧）
    │   ├── layout.tsx                      # ルートレイアウト
    │   ├── globals.css                     # グローバルスタイル
    │   ├── lib/
    │   │   └── api.ts                      # バックエンドAPI呼び出し関数
    │   ├── components/
    │   │   ├── ReportList.tsx              # 報告一覧コンポーネント
    │   │   ├── NewReportForm.tsx           # 新規登録フォーム
    │   │   └── EditReportForm.tsx          # 編集フォーム
    │   └── reports/
    │       ├── new/page.tsx                # 新規登録ページ
    │       └── [id]/edit/page.tsx          # 編集ページ
    ├── vercel.json
    └── .env.example
```

## ローカル起動

### 必要なもの

- Python 3.11+
- Node.js 18+

### バックエンド

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate      # Windows
# source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

起動後 → http://localhost:8000/docs（Swagger UI）

### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

起動後 → http://localhost:3000

## API エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/reports` | 一覧取得（`machine_name` / `location` / `status` クエリで絞り込み） |
| `POST` | `/reports` | 新規登録（`multipart/form-data`） |
| `PUT` | `/reports/{id}` | 報告内容編集（`multipart/form-data`） |
| `PATCH` | `/reports/{id}` | ステータスのみ更新（JSON） |
| `DELETE` | `/reports/{id}` | 削除 |
| `GET` | `/reports/{id}/pdf` | PDF ダウンロード |
| `GET` | `/files/{filename}` | アップロードファイル配信 |

## DBモデル

| カラム | 型 | 説明 |
|---|---|---|
| `id` | INTEGER | 主キー（自動採番） |
| `machine_name` | TEXT | 機器名 |
| `location` | TEXT | 発生場所 |
| `description` | TEXT | 異常内容 |
| `severity` | TEXT | 重要度（`high` / `medium` / `low`） |
| `status` | TEXT | 対応状況（`open` / `in_progress` / `resolved`） |
| `file_path` | TEXT | アップロードファイルのパス |
| `file_type` | TEXT | ファイル種別（`image` / `video`） |
| `reported_at` | TEXT | 報告日時（自動設定） |

## デプロイ

### Railway（バックエンド）

1. Railway でプロジェクト作成 → `backend/` ディレクトリを指定
2. **Volume を追加** — マウントパス: `/uploads`
3. **環境変数を設定**

   | 変数名 | 値 |
   |---|---|
   | `UPLOAD_DIR` | `/uploads` |

4. デプロイ後のURLを控える（例: `https://xxx.railway.app`）

### Vercel（フロントエンド）

1. Vercel でプロジェクト作成 → `frontend/` ディレクトリを Root Directory に指定
2. **Environment Variables を設定**

   | 変数名 | 値 |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | Railwayの URL（例: `https://xxx.railway.app`） |

3. デプロイ

## 対応ファイル形式

| 種別 | 拡張子 |
|---|---|
| 画像 | `.jpg` `.jpeg` `.png` `.gif` `.webp` |
| 動画 | `.mp4` `.mov` `.avi` `.webm` |

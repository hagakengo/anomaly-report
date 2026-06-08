# 異常報告管理システム

製造現場の設備異常をデジタルで記録・追跡・分析するWebアプリケーションです。  
オペレーターがスマホ・PCから異常を報告し、メーカーや管理者がリアルタイムで確認・対応できます。

---

## 主な機能

### オペレーター（現場）
| 機能 | 説明 |
|---|---|
| **選択式AIヒアリング** | 機器→場所→症状→詳細→重要度をボタン選択だけで報告書を自動作成 |
| **事前確認チェック** | 報告前にメーカー定義の確認項目（機器ごと＋共通）を選択式で実施 |
| **手動入力** | フォームから直接入力する従来方式も選択可能 |
| **画像・動画添付** | 現場の状況を撮影してアップロード |
| **チャット** | 報告書ごとにメーカー・管理者とリアルタイムでやり取り |

### メーカー・管理者
| 機能 | 説明 |
|---|---|
| **ダッシュボード** | 新着報告・統計（月別推移・重要度分布・頻発機器）を一覧表示 |
| **会社別タブ** | 顧客企業ごとに報告を分けて管理 |
| **担当者アサイン** | 報告にスタッフをアサインしてステータス管理 |
| **確認項目の設定** | 機器グループごとに事前確認項目を登録・編集・削除 |
| **PDF出力** | 報告内容と添付画像を含むA4帳票を自動生成 |
| **WebSocket通知** | 新着報告がリアルタイムで通知される |

---

## 技術構成

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 16 (Turbopack) / React 19 / TypeScript / Tailwind CSS v4 |
| バックエンド | FastAPI / SQLAlchemy / SQLite |
| AI | Groq API（Llama 3.3 70B）|
| リアルタイム通信 | WebSocket |
| 認証 | JWT（役割：admin / maker / customer）|
| PDF生成 | ReportLab + IPAex ゴシック |
| デプロイ（フロント） | Vercel |
| デプロイ（バック） | Railway + Volume |

---

## ローカル起動

### 必要なもの

- Python 3.9+
- Node.js 18+
- Groq API キー（[console.groq.com](https://console.groq.com) で無料取得）

### バックエンド

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Mac/Linux
# .\venv\Scripts\activate       # Windows
pip install -r requirements.txt
```

`.env` ファイルを作成：

```env
GROQ_API_KEY=your_groq_api_key_here
ALLOWED_ORIGINS=http://localhost:3000
```

```bash
uvicorn main:app --reload --port 8000
```

→ http://localhost:8000/docs（Swagger UI）

### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

→ http://localhost:3000

---

## 役割と権限

| 役割 | 説明 |
|---|---|
| `admin` | 全報告の閲覧・編集・削除、スタッフ管理、設定ページ |
| `maker` | 担当会社の報告閲覧・担当者アサイン、確認項目設定 |
| `customer` | 自社の報告登録・閲覧、チャット |

サインアップ時にロールを選択します。

---

## 画面構成

```
/                       ダッシュボード（報告一覧・新着通知・統計）
/reports/new            AIヒアリング（選択式ウィザード）
/reports/new/manual     手動入力フォーム
/reports/[id]           報告詳細・ステータス変更・担当者アサイン
/reports/[id]/chat      チャット
/settings               確認項目の設定（admin / maker のみ）
/login                  ログイン
/signup                 新規登録
```

---

## API エンドポイント（主要）

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/auth/login` | ログイン → JWT 返却 |
| `POST` | `/auth/signup` | ユーザー登録 |
| `GET` | `/reports` | 報告一覧（フィルタ・ソート対応）|
| `POST` | `/reports` | 新規報告登録（multipart）|
| `GET` | `/reports/stats` | 統計データ |
| `GET` | `/reports/{id}/pdf` | PDF ダウンロード |
| `POST` | `/ai-interview` | AIヒアリング（Groq）|
| `GET` | `/check-items` | 確認項目一覧（機器指定で絞り込み）|
| `GET` | `/check-items/machines` | 機器名一覧 |
| `WS` | `/ws/{user_id}` | WebSocket 通知 |

---

## デプロイ

### Railway（バックエンド）

1. Railway でプロジェクト作成 → `backend/` を指定
2. Volume を追加（マウントパス: `/uploads`）
3. 環境変数を設定：

| 変数名 | 値 |
|---|---|
| `GROQ_API_KEY` | Groq API キー |
| `ALLOWED_ORIGINS` | フロントエンドの URL |
| `UPLOAD_DIR` | `/uploads` |

### Vercel（フロントエンド）

1. Vercel でプロジェクト作成 → `frontend/` を Root Directory に指定
2. 環境変数を設定：

| 変数名 | 値 |
|---|---|
| `NEXT_PUBLIC_API_URL` | Railway の URL |

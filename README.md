# 異常報告管理システム

製造現場の設備異常をデジタルで記録・追跡・分析するWebアプリケーションです。  
オペレーターがスマホ・PCから異常を報告し、メーカーや管理者がリアルタイムで確認・対応できます。

---

## 背景・制作動機

製造現場では、設備の異常を紙や口頭で報告する運用が多く、**報告漏れ・伝達ミス・情報の属人化**が慢性的な課題になっていました。

- 異常があっても「後で書こう」と後回しにして結果的に未報告になる
- 紙の報告書が担当者の手元に届かず、対応が遅れる
- 過去の異常履歴が整理されておらず、再発防止に活かせない

これらの課題を解決するために本システムを開発しました。  
特に**選択式AIヒアリング**は、入力の手間を最小化して報告のハードルを下げることを最優先に設計しています。

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
| **未読バッジ** | 新着メッセージをダッシュボードでバッジ表示 |

---

## 技術構成

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 16 (Turbopack) / React 19 / TypeScript / Tailwind CSS v4 |
| バックエンド | Django / Django REST Framework / PostgreSQL |
| 認証 | SimpleJWT（役割：admin / maker / customer）|
| AI | Groq API（Llama 3.3 70B）|
| PDF生成 | ReportLab + IPAex ゴシック |
| デプロイ（フロント） | Vercel |
| デプロイ（バック） | AWS EC2 (Ubuntu 22.04) + Nginx + Let's Encrypt + Gunicorn |

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
SECRET_KEY=your_secret_key_here
GROQ_API_KEY=your_groq_api_key_here
ALLOWED_ORIGINS=http://localhost:3000
```

```bash
python manage.py migrate
python manage.py runserver 8000
```

→ http://localhost:8000/

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
| `GET` | `/messages/unread-summary` | 未読メッセージ一覧 |

---

## デプロイ

### AWS EC2（バックエンド）

#### 構成
- Ubuntu 22.04 LTS / t2.micro（無料枠）
- Nginx でリバースプロキシ
- Let's Encrypt（nip.io）で HTTPS 化
- systemd でプロセス常駐化

#### セットアップ手順

**1. EC2 起動**

AWS コンソールで以下のセキュリティグループを設定：

| ポート | 用途 | ソース |
|---|---|---|
| 22 | SSH | 自分のIP |
| 80 | HTTP（Certbot認証用） | 0.0.0.0/0 |
| 443 | HTTPS | 0.0.0.0/0 |

**2. サーバーセットアップ**

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-pip python3-venv nginx certbot python3-certbot-nginx git
```

**3. PostgreSQL セットアップ**

```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql
```

```sql
CREATE DATABASE anomaly_report;
CREATE USER anomaly_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE anomaly_report TO anomaly_user;
\q
```

**4. デプロイ**

```bash
git clone git@github.com:hagakengo/anomaly-report.git
cd anomaly-report/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

`.env` ファイルを作成：

```env
SECRET_KEY=your_secret_key_here
DEBUG=False
ALLOWED_HOSTS=<1-2-3-4>.nip.io,127.0.0.1
GROQ_API_KEY=your_groq_api_key_here
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
UPLOAD_DIR=/home/ubuntu/anomaly-report/backend/uploads
DB_ENGINE=django.db.backends.postgresql
DB_NAME=anomaly_report
DB_USER=anomaly_user
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
```

**5. systemd で常駐化**

`/etc/systemd/system/anomaly.service` を作成：

```ini
[Unit]
Description=Anomaly Report Backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/anomaly-report/backend
Environment="PATH=/home/ubuntu/anomaly-report/backend/venv/bin"
EnvironmentFile=/home/ubuntu/anomaly-report/backend/.env
ExecStart=/home/ubuntu/anomaly-report/backend/venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable anomaly
sudo systemctl start anomaly
```

**6. Nginx 設定**

`/etc/nginx/sites-available/anomaly` を作成：

```nginx
server {
    listen 80;
    server_name <1-2-3-4>.nip.io;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 50M;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/anomaly /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo systemctl reload nginx
```

**7. HTTPS 化**

ドメインなしの場合は nip.io を使用（IPの`.`を`-`に変換）：

```bash
sudo certbot --nginx -d <1-2-3-4>.nip.io
```

#### コード更新時のデプロイ手順

```bash
ssh ubuntu@<EC2のIP>
cd anomaly-report
git pull
cd backend
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
sudo systemctl restart anomaly
```

#### よく使うコマンド

```bash
# ログ確認
sudo journalctl -u anomaly -f

# サービス再起動
sudo systemctl restart anomaly

# Nginx 再起動
sudo systemctl reload nginx
```

---

### Vercel（フロントエンド）

1. Vercel でプロジェクト作成
2. Build & Deployment Settings → Root Directory を `frontend` に設定
3. 環境変数を設定：

| 変数名 | 値 |
|---|---|
| `NEXT_PUBLIC_API_URL` | EC2 の HTTPS URL |

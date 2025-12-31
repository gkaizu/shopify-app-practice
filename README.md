# Shopify Inventory Alert App

Shopifyストアの在庫が閾値を下回るとSlackに通知するアプリ

---

## 学習内容

### 完了
- [x] Express基礎
- [x] REST API設計・実装
- [x] バリデーション・エラーハンドリング
- [x] Shopify OAuth認証
- [x] Shopify Admin API連携
- [x] PostgreSQL（Supabase）データ永続化
- [x] Row Level Security（RLS）
- [x] Slack App連携
- [x] 在庫アラート機能
- [x] 管理画面（Dashboard）
- [x] Docker化
- [x] Render.comデプロイ
- [x] GitHub Actions（CI/CD）
- [x] ESLint/Vitest導入

### 次の予定
- [ ] 管理画面CRUD強化
- [ ] Metafield版の実装
- [ ] 定期実行（cron）

---

## 学習記録

**Day 5（2025-12-28）**
- Supabaseでテーブル作成
- Row Level Security有効化
- アクセストークンの永続化

**Day 6（2025-12-29）**
- Slack App作成・連携
- アラート設定API実装
- 在庫チェック&通知機能
- 管理画面（Dashboard）作成

**Day 7（2025-12-30）**
- Docker化
- docker-compose.yml作成
- 開発環境の統一

**Day 8（2025-12-31）**
- Render.comにデプロイ
- 環境変数設定
- 本番環境で動作確認

**Day 9（2026-01-01）**
- GitHub Actions（CI/CD）実装
- ESLint/Vitest導入
- 自動デプロイ確認

---

## 技術スタック

- **Backend:** Node.js, Express
- **Database:** PostgreSQL (Supabase)
- **Auth:** OAuth 2.0
- **API:** Shopify Admin API (REST)
- **Security:** Row Level Security (RLS)
- **Notification:** Slack App (Incoming Webhooks)
- **Containerization:** Docker, Docker Compose
- **Deployment:** Render.com
- **CI/CD:** GitHub Actions
- **Code Quality:** ESLint, Vitest
- **Tools:** Git, curl

---

## 主な機能

1. **OAuth認証**
   - Shopifyストアと安全に接続
   
2. **在庫アラート**
   - 在庫が閾値を下回ったら通知
   - Slackにリアルタイム通知
   
3. **管理画面**
   - アラート設定の一覧表示
   - ブラウザから在庫チェック実行

4. **データ永続化**
   - PostgreSQLで設定を保存
   - サーバー再起動しても残る

5. **CI/CD**
   - Git pushで自動デプロイ
   - コード品質の自動チェック

---

## セットアップ

### 通常の起動
```bash
npm install
node index.js
```

### Dockerで起動（推奨）
```bash
docker-compose up
```

**アクセス:** http://localhost:3000

---

## デモ

**本番環境:**
https://shopify-app-practice.onrender.com

**ダッシュボード:**
https://shopify-app-practice.onrender.com/dashboard

---

## 背景

ニュージーランドでバリスタ（役職：スーパーバイザー）として勤務した際、在庫切れによる営業支障を経験。
この課題を技術で解決するため開発。

---

---

# 🌏 English Version

## Inventory Alert App for Shopify

A Shopify inventory monitoring system that sends Slack alerts when product stock falls below configured thresholds.

---

## Learning Progress

### Completed
- [x] Express basics
- [x] REST API design & implementation
- [x] Validation & error handling
- [x] Shopify OAuth authentication
- [x] Shopify Admin API integration
- [x] PostgreSQL (Supabase) data persistence
- [x] Row Level Security (RLS)
- [x] Slack App integration
- [x] Inventory alert feature
- [x] Dashboard UI
- [x] Dockerization
- [x] Deploy to Render.com
- [x] GitHub Actions (CI/CD)
- [x] ESLint/Vitest setup

### Roadmap
- [ ] Enhanced dashboard CRUD
- [ ] Metafield-based version
- [ ] Scheduled automatic checks (cron)

---

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** PostgreSQL (Supabase)
- **Auth:** OAuth 2.0
- **API:** Shopify Admin API (REST)
- **Security:** Row Level Security (RLS)
- **Notification:** Slack App (Incoming Webhooks)
- **Containerization:** Docker, Docker Compose
- **Deployment:** Render.com
- **CI/CD:** GitHub Actions
- **Code Quality:** ESLint, Vitest
- **Tools:** Git, curl

---

## Key Features

1. **Shopify OAuth Integration**
   - Secure authentication with Shopify stores
   
2. **Inventory Monitoring**
   - Configurable threshold alerts per product
   - Manual inventory checks via dashboard or API
   - Real-time Slack notifications
   
3. **Dashboard UI**
   - View all alert configurations
   - Trigger inventory checks
   
4. **Data Persistence**
   - PostgreSQL for reliable storage
   - RLS for multi-tenant security

5. **CI/CD**
   - Automated deployment on Git push
   - Automated code quality checks

---

## Setup

### Standard Setup
```bash
npm install
node index.js
```

### Docker Setup (Recommended)
```bash
docker-compose up
```

**Access:** http://localhost:3000

---

## Demo

**Production:**
https://shopify-app-practice.onrender.com

**Dashboard:**
https://shopify-app-practice.onrender.com/dashboard

---

## Background

Built from hands-on experience as a barista supervisor in New Zealand, where inventory shortages frequently disrupted operations. This app addresses that pain point through automated monitoring.

---
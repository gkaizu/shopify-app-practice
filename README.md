# Shopify App Practice

Shopifyアプリ開発の学習用プロジェクト

## 概要
Node.js/ExpressでREST APIの基礎を学び、Shopifyアプリ開発に必要なスキルを習得するプロジェクトです。

バリスタ経験を活かし、将来的にはカフェ向けShopifyアプリを開発予定。

## 技術スタック
- Node.js v18
- Express v4
- PostgreSQL（予定）

## セットアップ
```bash
# 依存関係をインストール
npm install

# サーバー起動
node index.js
```

http://localhost:3000 でアクセス可能

## API エンドポイント

### 商品管理
- `GET /products` - 商品一覧取得
- `POST /products` - 商品追加

### ユーザー管理  
- `GET /users` - ユーザー一覧取得
- `POST /users` - ユーザー追加

### 注文管理
- `GET /orders` - 注文一覧取得
- `POST /orders` - 注文作成

## 使用例
```bash
# 商品一覧取得
curl http://localhost:3000/products

# 商品追加
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Product C","price":3000}'
```

## 学習内容

### 完了
- [x] Express基礎
- [x] REST API設計・実装
- [x] バリデーション・エラーハンドリング
- [x] curlでのAPI テスト

### 次の予定
- [ ] Shopify OAuth認証
- [ ] Shopify Admin API連携
- [ ] PostgreSQL連携
- [ ] Docker化

## 学習記録

**Day 1-3（2025-12-27〜29）**
- Expressサーバー構築
- GET/POSTエンドポイント実装
- エラーハンドリング追加

## 作成者
Gen - Shopify開発者を目指して学習中

**Background:**
- バリスタスーパーバイザー（NZ、2年）
- TOEIC 880
- カフェ向けEC開発に興味

## ライセンス
MIT

---

## English Version

A learning project for Shopify app development.

### Tech Stack
- Node.js v18
- Express v4
- PostgreSQL (upcoming)

### Current Progress
- [x] Express basics
- [x] REST API implementation
- [x] Error handling
- [ ] Shopify OAuth (next)

### Background
Building toward Shopify development for cafes, leveraging my experience 
as a barista supervisor in New Zealand.

## License
MIT
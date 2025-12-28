## 学習内容

### 完了
- [x] Express基礎
- [x] REST API設計・実装
- [x] バリデーション・エラーハンドリング
- [x] curlでのAPI テスト
- [x] Shopify OAuth認証
- [x] Shopify Admin API連携
- [x] **PostgreSQL（Supabase）データ永続化** ← 追加
- [x] **Row Level Security（RLS）** ← 追加

### 次の予定
- [ ] アラート設定機能実装
- [ ] Slack/メール通知
- [ ] Docker化
- [ ] Vercelデプロイ

## 学習記録

**Day 1-3（2025-12-26〜27）**
- Expressサーバー構築
- GET/POSTエンドポイント実装
- エラーハンドリング追加

**Day 4（2025-12-28）**
- Shopify OAuth認証実装
- Shopify Admin API連携
- 実際のストアデータ取得成功

**Day 5（2025-12-28）** ← 追加
- Supabaseでテーブル作成（shops, alert_settings）
- Row Level Security（RLS）有効化
- アクセストークンの永続化
- サーバー再起動してもデータが残る仕組み実装

## 技術スタック

- **Backend:** Node.js, Express
- **Database:** PostgreSQL (Supabase) ← 追加
- **Auth:** OAuth 2.0
- **API:** Shopify Admin API (REST)
- **Security:** Row Level Security (RLS) ← 追加
- **Tools:** Git, curl
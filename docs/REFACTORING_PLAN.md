# HTMLテンプレート分離リファクタリング作業ガイド

> **作業目的**: index.js内のインラインHTMLを全てEJSテンプレートに分離し、コードの保守性と一貫性を向上させる
> **所要時間**: 約20分
> **目標**: プロダクション環境での運用を見据えた、保守性と可読性の高いコード品質の確立

---

## 📋 作業チェックリスト

- [ ] Phase 1: ブランチ作成とセットアップ
- [ ] Phase 2: 認証成功画面のEJS化
- [ ] Phase 3: 認証必須画面のEJS化
- [ ] Phase 4: トップページのEJS化
- [ ] Phase 5: 動作確認とマージ

---

## 🎯 なぜこのリファクタリングが必要か

### 現状の問題点
1. **コードの一貫性**: dashboard.ejsとerror.ejsはEJSなのに、3つのページだけインラインHTML
2. **保守性**: HTMLの修正のたびにJavaScriptファイルを開く必要がある
3. **面接での印象**: 「リファクタリング途中で止まっている」と見なされるリスク

### 修正対象（3箇所）

| ファイル | 行数 | エンドポイント | 優先度 |
|---------|------|---------------|--------|
| index.js | 176-181 | `GET /auth/callback` (認証成功) | 🔴 高 |
| index.js | 580-584 | `GET /products/shopify` (認証必須) | 🔴 高 |
| index.js | 608-616 | `GET /` (トップページ) | 🔴 高 |

---

## 🔀 Gitワークフロー戦略

### ブランチ構成
```
main (本番環境)
  └── refactor/separate-html-templates (作業ブランチ)
```

### コミット戦略
- **小さく頻繁にコミット**: 1ファイル作成→1コミット
- **わかりやすいコミットメッセージ**: Conventional Commits形式
- **動作確認後にコミット**: 必ず `npm start` で確認してからコミット

---

## 📝 Phase 1: ブランチ作成とセットアップ

### 1-1. 新しいブランチを作成

```bash
# 現在のブランチを確認
git branch

# 最新のmainに移動
git checkout main

# 新しいブランチを作成して移動
git checkout -b refactor/separate-html-templates
```

### 1-2. 現在の状態を確認

```bash
# 変更がないことを確認
git status

# viewsディレクトリの構成を確認
ls -la views/
```

**期待される出力**:
```
dashboard.ejs
error.ejs
```

---

## 📝 Phase 2: 認証成功画面のEJS化

### 2-1. `views/auth-success.ejs` を作成

以下の内容で新規ファイルを作成:

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>認証成功 - Shopify Inventory Alert</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #5c6ac4;
      margin-bottom: 20px;
    }
    p {
      line-height: 1.6;
      color: #333;
    }
    a {
      color: #5c6ac4;
      text-decoration: none;
      font-weight: 600;
    }
    a:hover {
      text-decoration: underline;
    }
    .success-icon {
      font-size: 48px;
      text-align: center;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">✅</div>
    <h1>認証成功！</h1>
    <p>Shopify APIを使えるようになりました。</p>
    <p>アクセストークンをデータベースに保存しました。</p>
    <p><a href="/products/shopify">→ Shopifyの商品データを取得する</a></p>
    <p><a href="/dashboard">→ ダッシュボードへ移動</a></p>
  </div>
</body>
</html>
```

**作成コマンド**:
```bash
# VS Codeで作成する場合
code views/auth-success.ejs
# 上記の内容をペーストして保存
```

---

### 2-2. `index.js` を修正

**修正箇所**: 176-181行目

**修正前**:
```javascript
res.send(`
  <h1>認証成功！</h1>
  <p>Shopify APIを使えるようになりました。</p>
  <p>アクセストークンをデータベースに保存しました。</p>
  <p><a href="/products/shopify">Shopifyの商品データを取得する</a></p>
`);
```

**修正後**:
```javascript
res.render('auth-success');
```

**実際の編集**:
1. `index.js` を開く
2. 176行目から181行目を選択
3. 上記の1行に置き換え
4. 保存

---

### 2-3. 動作確認

```bash
# サーバーを起動
npm start

# ブラウザで以下にアクセス
# http://localhost:3000/auth?shop=dev-practice-store-app.myshopify.com
# → Shopifyの認証画面に遷移
# → 認証後、auth-success.ejsが表示されることを確認
```

**確認ポイント**:
- ✅ ページが正しく表示される
- ✅ スタイルが適用されている
- ✅ リンクが正しく動作する

---

### 2-4. コミット

```bash
# 変更を確認
git status

# ファイルをステージング
git add views/auth-success.ejs
git add index.js

# コミット
git commit -m "refactor: Move auth success page to EJS template"
```

---

## 📝 Phase 3: 認証必須画面のEJS化

### 3-1. `views/auth-required.ejs` を作成

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>認証が必要です - Shopify Inventory Alert</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #de3618;
      margin-bottom: 20px;
    }
    p {
      line-height: 1.6;
      color: #333;
    }
    a {
      display: inline-block;
      margin-top: 20px;
      padding: 12px 24px;
      background-color: #5c6ac4;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      font-weight: 600;
    }
    a:hover {
      background-color: #4959bd;
    }
    .warning-icon {
      font-size: 48px;
      text-align: center;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="warning-icon">⚠️</div>
    <h1>認証が必要です</h1>
    <p>まず認証を行ってください。</p>
    <a href="/auth?shop=dev-practice-store-app.myshopify.com">認証を開始</a>
  </div>
</body>
</html>
```

---

### 3-2. `index.js` を修正

**修正箇所**: 580-584行目

**修正前**:
```javascript
return res.status(401).send(`
  <h1>認証が必要です</h1>
  <p>まず認証してください:</p>
  <p><a href="/auth?shop=dev-practice-store-app.myshopify.com">認証を開始</a></p>
`);
```

**修正後**:
```javascript
return res.status(401).render('auth-required');
```

---

### 3-3. 動作確認

```bash
# サーバーを起動（起動中なら再起動）
npm start

# ブラウザで以下にアクセス
# http://localhost:3000/products/shopify
# → 認証していない場合、auth-required.ejsが表示されることを確認
```

---

### 3-4. コミット

```bash
git add views/auth-required.ejs
git add index.js
git commit -m "refactor: Move auth required page to EJS template"
```

---

## 📝 Phase 4: トップページのEJS化

### 4-1. `views/index.ejs` を作成

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shopify Inventory Alert App</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 8px 16px rgba(0,0,0,0.2);
    }
    h1 {
      color: #333;
      margin-bottom: 10px;
      font-size: 2.5em;
    }
    p {
      color: #666;
      line-height: 1.8;
      margin-bottom: 30px;
    }
    .badge {
      display: inline-block;
      background-color: #00d4aa;
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 0.9em;
      font-weight: 600;
      margin-bottom: 20px;
    }
    ul {
      list-style: none;
      padding: 0;
    }
    li {
      margin-bottom: 15px;
    }
    a {
      display: inline-block;
      padding: 12px 24px;
      background-color: #5c6ac4;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      transition: all 0.3s ease;
    }
    a:hover {
      background-color: #4959bd;
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    }
    .icon {
      margin-right: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📦 Shopify Inventory Alert App</h1>
    <span class="badge">CI/CD対応済み</span>
    <p>在庫アラートアプリへようこそ！</p>
    <p>在庫切れによる機会損失を防ぐ、リアルタイム監視ソリューションです。</p>

    <ul>
      <li>
        <a href="/auth?shop=dev-practice-store-app.myshopify.com">
          <span class="icon">🔐</span>OAuth認証（開発環境）
        </a>
      </li>
      <li>
        <a href="/dashboard">
          <span class="icon">📊</span>ダッシュボード
        </a>
      </li>
    </ul>
  </div>
</body>
</html>
```

---

### 4-2. `index.js` を修正

**修正箇所**: 607-617行目

**修正前**:
```javascript
app.get("/", (req, res) => {
  res.send(`
  <h1>Shopify Inventory Alert App</h1>
  <p>在庫アラートアプリへようこそ！</p>
  <p><strong>CI/CD対応済み</strong></p>
  <ul>
    <li><a href="/auth?shop=dev-practice-store-app.myshopify.com">OAuth認証（開発環境）</a></li>
    <li><a href="/dashboard">ダッシュボード</a></li>
  </ul>
`);
});
```

**修正後**:
```javascript
app.get("/", (req, res) => {
  res.render('index');
});
```

---

### 4-3. 動作確認

```bash
# サーバーを起動
npm start

# ブラウザで以下にアクセス
# http://localhost:3000/
# → index.ejsが表示されることを確認
```

**確認ポイント**:
- ✅ グラデーション背景が表示される
- ✅ バッジが表示される
- ✅ ボタンのホバーエフェクトが動作する

---

### 4-4. コミット

```bash
git add views/index.ejs
git add index.js
git commit -m "refactor: Move index page to EJS template"
```

---

## 📝 Phase 5: 最終確認とマージ

### 5-1. 全体の動作確認

以下の全エンドポイントをブラウザで確認:

```bash
# サーバー起動
npm start
```

| URL | 期待される画面 | 確認 |
|-----|--------------|------|
| http://localhost:3000/ | トップページ（グラデーション背景） | [ ] |
| http://localhost:3000/dashboard | ダッシュボード（既存EJS） | [ ] |
| http://localhost:3000/products/shopify | 認証必須画面（未認証時） | [ ] |
| http://localhost:3000/auth/callback?shop=xxx&code=xxx | 認証成功画面 | [ ] |

---

### 5-2. Linterを実行

```bash
# ESLintチェック
npm run lint

# エラーがあれば修正
# エラーがなければ次へ
```

---

### 5-3. コミット履歴を確認

```bash
git log --oneline
```

**期待される出力**:
```
abc1234 refactor: Move index page to EJS template
def5678 refactor: Move auth required page to EJS template
ghi9012 refactor: Move auth success page to EJS template
```

---

### 5-4. mainブランチにマージ

```bash
# mainブランチに切り替え
git checkout main

# 作業ブランチをマージ
git merge refactor/separate-html-templates

# プッシュ
git push origin main
```

---

### 5-5. 作業ブランチを削除（任意）

```bash
# ローカルブランチを削除
git branch -d refactor/separate-html-templates

# リモートブランチも削除する場合
git push origin --delete refactor/separate-html-templates
```

---

## ✅ 完了後のチェックリスト

- [ ] 全3つのEJSファイルが作成された
- [ ] index.jsから全てのインラインHTMLが削除された
- [ ] 全エンドポイントが正しく動作する
- [ ] Linterエラーがない
- [ ] コミットが適切に行われた
- [ ] mainブランチにマージされた

---

## 🎓 このリファクタリングで得られるもの

### 技術的メリット
1. **コードの一貫性**: 全てのビューがEJSで統一
2. **保守性向上**: HTML修正時にJSファイルを開く必要がない
3. **再利用性**: テンプレートの共通化が容易

### 面接でのアピールポイント
1. **正しいGitワークフロー**: フィーチャーブランチでの作業
2. **小さなコミット**: 1機能1コミットの原則
3. **コード品質へのこだわり**: 完璧を目指す姿勢

---

## 💡 トラブルシューティング

### エラー: "Cannot find module 'auth-success'"
**原因**: EJSファイルのファイル名が間違っている
**解決**: ファイル名が `auth-success.ejs` になっているか確認

### エラー: "res.render is not a function"
**原因**: Expressの設定が正しくない
**解決**: index.jsに以下があるか確認
```javascript
app.set('view engine', 'ejs');
app.set('views', './views');
```

### ページが真っ白
**原因**: EJSファイルの構文エラー
**解決**: ブラウザの開発者ツールでエラーを確認

---

## 📞 質問・サポート

作業中に不明点があれば、このファイルを参照しながら進めてください。

**成功を祈っています！頑張ってください！** 🚀

---

**作成日**: 2026年1月18日
**想定作業時間**: 20分
**目標**: Shopify Plusパートナー企業・SE職・年収600万円

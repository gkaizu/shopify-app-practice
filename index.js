require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = 3000;

// 環境変数
const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES, HOST } =
  process.env;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log("Supabase connected with service_role");

// JSONを受け取る設定（これがないとPOSTが動かない）
app.use(express.json());

// ==================
// Shopify OAuth認証
// ==================

// Step 1: アプリインストール開始
app.get("/auth", (req, res) => {
  const shop = req.query.shop;

  if (!shop) {
    return res
      .status(400)
      .send(
        "Missing shop parameter. Usage: /auth?shop=your-store.myshopify.com"
      );
  }

  // リダイレクトURL
  const redirectUri = `${HOST}/auth/callback`;

  // nonce（セキュリティ用ランダム文字列）
  const nonce = crypto.randomBytes(16).toString("hex");

  // Shopifyの認証ページURL
  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPES}&redirect_uri=${redirectUri}&state=${nonce}`;

  console.log("認証URLにリダイレクト:", authUrl);
  res.redirect(authUrl);
});

// Step 2: Shopifyからのコールバック
app.get("/auth/callback", async (req, res) => {
  const { shop, code, state } = req.query;

  if (!shop || !code) {
    return res.status(400).send("Missing required parameters");
  }

  try {
    console.log("アクセストークンを取得中...");

    // Shopifyからアクセストークンを取得
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code: code,
      }
    );

    const accessToken = tokenResponse.data.access_token;
    console.log("アクセストークン取得成功！");

    // Supabase(PostgreSQL)に保存
    const { data, error } = await supabase
      .from("shops")
      .upsert(
        {
          shop_name: shop,
          access_token: accessToken,
        },
        {
          onConflict: "shop_name",
        }
      )
      .select();

    if (error) {
      console.log("データベース保存エラー:", error);
      throw error;
    }

    console.log("データベースに保存成功:", data);

    // 互換性のためグローバル変数にも保存
    global.shopifyAccessToken = accessToken;
    global.shopName = shop;

    res.send(`
      <h1>認証成功！</h1>
      <p>Shopify APIを使えるようになりました。</p>
      <p>アクセストークンをデータベースに保存しました。</p>
      <p><a href="/products/shopify">Shopifyの商品データを取得する</a></p>
    `);
  } catch (error) {
    console.log("認証エラー:", error.response?.data || error.message);
    res
      .status(500)
      .send(
        "認証に失敗しました: " + (error.response?.data.error || error.message)
      );
  }
});

// Step 3: Shopify APIをテスト
app.get("/products/shopify", async (req, res) => {
  try {
    // データベースからアクセストークンを取得
    const { data: shops, error } = await supabase
      .from("shops")
      .select("*")
      .limit(1)
      .single();

    if (error || !shops) {
      return res.status(401).send(`
        <h1>認証が必要です</h1>
        <p>まず認証してください:</p>
        <p><a href="/auth?shop=dev-practice-store-app.myshopify.com">認証を開始</a></p>
        <p>* dev-practice-store-app.myshopify.com を実際のストアURLに置き換えてください</p>
      `);
    }

    const { shop_name, access_token } = shops;

    console.log("データベースからトークン取得:", shop_name);
    console.log("Shopify APIを呼び出し中...");

    // Shopify Admin APIで商品一覧を取得
    const response = await axios.get(
      `https://${shop_name}/admin/api/2025-01/products.json`,
      {
        headers: {
          "X-Shopify-Access-Token": access_token,
        },
      }
    );

    console.log("商品データ取得成功！");
    res.json(response.data);
  } catch (error) {
    console.log("API呼び出しエラー:", error.response?.data || error.message);
    res.status(500).json({
      error: "Shopify API呼び出しに失敗しました",
      details: error.response?.data || error.message,
    });
  }
});

// ==================
// 既存のエンドポイント
// ==================
// GET：ルート
app.get("/", (req, res) => {
  res.json({ message: "Hello from Express" });
});

// GET：商品一覧
app.get("/products", (req, res) => {
  const products = [
    { id: 1, name: "Product A", price: 1000 },
    { id: 2, name: "Product B", price: 2000 },
  ];
  res.json(products);
});

// POST：商品追加
app.post("/products", (req, res) => {
  // リクエストボディからデータを取得
  const newProduct = req.body;

  // バリデーション：nameとpriceが存在するかチェック
  if (!newProduct.name || !newProduct.price) {
    return res.status(400).json({
      error: "nameとpriceは必須です",
    });
  }

  // priceが数値かチェック
  if (typeof newProduct.price !== "number") {
    return res.status(400).json({
      error: "priceは数値である必要があります",
    });
  }

  // 受け取ったデータを確認
  console.log("受け取ったデータ：", newProduct);

  // レスポンスを返す
  res.json({
    message: "商品を追加しました",
    product: newProduct,
  });
});

// GET：ユーザー一覧
app.get("/users", (req, res) => {
  const users = [
    { id: 1, name: "Sam", age: 19 },
    { id: 2, name: "Julia", age: 22 },
  ];
  res.json(users);
});

// POST：ユーザー追加
app.post("/users", (req, res) => {
  // リクエストボディからデータを取得
  const newUser = req.body;

  // 受け取ったデータを確認
  console.log("受け取ったユーザー：", newUser);

  // レスポンスを返す
  res.json({
    message: "ユーザーを追加しました",
    user: newUser,
  });
});

// GET：注文一覧
app.get("/orders", (req, res) => {
  const orders = [
    { id: 1, userId: 1, productId: 1, quantity: 2, total: 2000 },
    { id: 2, userId: 2, productId: 2, quantity: 1, total: 2000 },
  ];
  res.json(orders);
});

// POST：注文作成
app.post("/orders", (req, res) => {
  // リクエストボディからデータを取得
  const newOrder = req.body;

  // 受け取ったデータを確認
  console.log("受け取った注文：", newOrder);

  // レスポンスを返す
  res.json({
    message: "注文を作成しました",
    user: newOrder,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

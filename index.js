require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const { createClient } = require("@supabase/supabase-js");
const { text } = require("stream/consumers");
const { threadCpuUsage } = require("process");

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
// ヘルパー関数
// ==================

// slack通知を送信する関数
async function sendSlackNotification(
  productTitle,
  productId,
  currentInventory,
  threshold,
  shopName
) {
  try {
    // 特殊文字をエスケープ
    const safeTitle = String(productTitle || "Unknown Product").replace(
      /[<>&]/g,
      ""
    );
    const safeShopName = String(shopName || "Unknown Shop").replace(
      /[<>&]/g,
      ""
    );

    const message = {
      text: `在庫アラート: ${safeTitle}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "在庫アラート",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${safeTitle}* の在庫が少なくなっています。`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*商品ID:*\n${productId}`,
            },
            {
              type: "mrkdwn",
              text: `*現在の在庫:*\n${currentInventory}個`,
            },
            {
              type: "mrkdwn",
              text: `*閾値:*\n${threshold}個`,
            },
            {
              type: "mrkdwn",
              text: `*ストア:*\n${safeShopName}`,
            },
          ],
        },
        {
          type: "divider",
        },
        {
          type: "context",
          elements: [
            {
              type: "plain_text",
              text: new Date().toLocaleString("ja-JP", {
                timeZone: "Asia/Tokyo",
              }),
            },
          ],
        },
      ],
    };

    const response = await axios.post(process.env.SLACK_WEBHOOK_URL, message);
    console.log("slack通知送信成功");
    return response.data;
  } catch (error) {
    console.log("slack通知エラー:", error.response?.data || error.message);

    // エラー時はシンプルなメッセージを送信
    try {
      const simpleMessage = {
        text: `在庫アラート\n商品: ${productTitle}\n在庫: ${currentInventory}個\n閾値: ${threshold}個`,
      };
      await axios.post(process.env.SLACK_WEBHOOK_URL, simpleMessage);
      console.log("slack通知送信成功（シンプル版）");
    } catch (fallbackError) {
      console.error(
        "slack通知（フォールバック）もエラー:",
        fallbackError.message
      );
      throw error;
    }
  }
}

// ==================
// Shopify OAuth認証
// ==================
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

// ==================
// 商品管理API
// ==================
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

// ==================
// Slack通知テスト
// ==================
app.get("/test-slack", async (req, res) => {
  try {
    const message = {
      text: "slack通知テスト成功！",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*在庫アラート*\n商品の在庫が少なくなっています",
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: "*商品ID:*\n123456789",
            },
            {
              type: "mrkdwn",
              text: "*現在の在庫:*\n5個",
            },
            {
              type: "mrkdwn",
              text: "*閾値:*\n10個",
            },
            {
              type: "mrkdwn",
              text: "*ストア:*\ndev-practice-store-app",
            },
          ],
        },
      ],
    };

    const response = await axios.post(process.env.SLACK_WEBHOOK_URL, message);

    console.log("slack通知送信成功");

    res.json({
      success: true,
      message: "slack通知を送信しました。slackを確認してください。",
    });
  } catch (error) {
    console.error("slack通知エラー:", error.response?.data || error.message);
    res.status(500).json({
      error: "slack通知の送信に失敗しました",
      details: error.response?.data || error.message,
    });
  }
});

// ==================
// アラート設定API
// ==================
app.post("/alert-settings", async (req, res) => {
  const { shop_name, product_id, threshold } = req.body;

  if (!shop_name || !product_id || !threshold) {
    return res.status(400).json({
      error: "shop_name, product_id, thresholdは全て必須です",
    });
  }

  if (typeof threshold !== "number" || threshold < 0) {
    return res.status(400).json({
      error: "thresholdは0以上の数値である必要があります",
    });
  }

  try {
    // shop_idを取得
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("shop_name", shop_name)
      .single();

    if (shopError || !shop) {
      return res.status(400).json({
        error: "ストアが見つかりません。先に認証してください。",
      });
    }

    // アラート設定を保存
    const { data, error } = await supabase
      .from("alert_settings")
      .insert({
        shop_id: shop.id,
        product_id: product_id,
        threshold: threshold,
        is_active: true,
      })
      .select();

    if (error) throw error;

    console.log("アラート設定を保存:", data);

    res.json({
      message: "アラート設定を保存しました",
      data: data,
    });
  } catch (error) {
    console.log("アラート設定エラー:", error);
    res.status(400).json({
      error: "アラート設定の保存に失敗しました",
      details: error.message,
    });
  }
});

// アラート設定一覧を取得
app.get("/alert-settings", async (req, res) => {
  const { shop_name } = req.query;

  if (!shop_name) {
    return res.status(400).json({
      error: "shop_nameパラメータが必要です",
    });
  }

  try {
    // shop_idを取得
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("shop_name", shop_name)
      .single();

    if (shopError || !shop) {
      return res.status(400).json({
        error: "ストアが見つかりません",
      });
    }

    // アラート設定を取得
    const { data, error } = await supabase
      .from("alert_settings")
      .select("*")
      .eq("shop_id", shop.id);

    if (error) throw error;

    res.json({
      shop_name: shop_name,
      settings: data,
    });
  } catch (error) {
    console.log("取得エラー:", error);
    res.status(500).json({
      error: "アラート設定の取得に失敗しました",
      details: error.message,
    });
  }
});

// ==================
// 在庫チェック&通知機能
// ==================

// 在庫をチェックして通知
app.get("/check-inventory", async (req, res) => {
  const { shop_name } = req.query;

  if (!shop_name) {
    return res.status(400).json({
      error: "shop_nameパラメータが必要です",
    });
  }

  try {
    console.log("在庫チェック開始:", shop_name);

    // 1.ストア情報を取得
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("*")
      .eq("shop_name", shop_name)
      .single();

    if (shopError || !shop) {
      return res.status(404).json({
        error: "ストアが見つかりません",
      });
    }

    // 2.アクティブなアラート設定を取得
    const { data: settings, error: settingsError } = await supabase
      .from("alert_settings")
      .select("*")
      .eq("shop_id", shop.id)
      .eq("is_active", true);

    if (settingsError) throw settingsError;

    if (!settings || settings.length === 0) {
      return res.json({
        message: "アクティブなアラート設定がありません",
        checked: 0,
      });
    }

    console.log(`${settings.length}件のアラート設定を確認`);

    // 3.各設定について在庫をチェック
    const alerts = [];

    for (const setting of settings) {
      try {
        // Shopify APIで商品情報を取得
        const response = await axios.get(
          `https://${shop.shop_name}/admin/api/2025-01/products/${setting.product_id}.json`,
          {
            headers: {
              "X-Shopify-Access-Token": shop.access_token,
            },
          }
        );

        const product = response.data.product;

        // 在庫数を計算（全バリエーションの合計）
        const totalInventory = product.variants.reduce((sum, variant) => {
          return sum + (variant.inventory_quantity || 0);
        }, 0);

        console.log(
          `商品: ${product.title}, 在庫: ${totalInventory}, 閾値: ${setting.threshold}`
        );

        // 閾値チェック
        if (totalInventory <= setting.threshold) {
          console.log(`アラート発動: ${product.title}`);

          //slack通知送信
          await sendSlackNotification(
            product.title,
            product.id,
            totalInventory,
            setting.threshold,
            shop.shop_name
          );

          alerts.push({
            product_id: product.id,
            product_title: product.title,
            current_inventory: totalInventory,
            threshold: setting.threshold,
            alerted: true,
          });
        } else {
          alerts.push({
            product_id: product.id,
            product_title: product.title,
            current_inventory: totalInventory,
            threshold: setting.threshold,
            alerted: false,
          });
        }
      } catch (error) {
        console.error(
          `商品ID ${setting.product_id} の取得エラー:`,
          error.response?.data || error.message
        );
        alerts.push({
          product_id: setting.product_id,
          error: error.response?.data?.errors || error.message,
        });
      }
    }

    console.log("在庫チェック完了");

    res.json({
      message: "在庫チェック完了",
      shop_name: shop.shop_name,
      checked: settings.length,
      alerts: alerts,
    });
  } catch (error) {
    console.error("在庫チェックエラー:", error);
    res.status(500).json({
      error: "在庫チェックに失敗しました",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', './views');

app.use(express.static('public'));

// 環境変数
const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES, HOST } =
  process.env;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log("Supabase connected with service_role");

app.use(express.json());

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
    return response.data;
  } catch (error) {
    try {
      const simpleMessage = {
        text: `在庫アラート\n商品: ${productTitle}\n在庫: ${currentInventory}個\n閾値: ${threshold}個`,
      };
      await axios.post(process.env.SLACK_WEBHOOK_URL, simpleMessage);
    } catch (fallbackError) {
      console.error("slack通知（フォールバック）もエラー:", fallbackError.message);
      throw error;
    }
  }
}

app.get("/auth", (req, res) => {
  const shop = req.query.shop;

  if (!shop) {
    return res
      .status(400)
      .send(
        "Missing shop parameter. Usage: /auth?shop=your-store.myshopify.com"
      );
  }

  const redirectUri = `${HOST}/auth/callback`;
  const nonce = crypto.randomBytes(16).toString("hex");
  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPES}&redirect_uri=${redirectUri}&state=${nonce}`;

  res.redirect(authUrl);
});

app.get("/auth/callback", async (req, res) => {
  const { shop, code } = req.query;

  if (!shop || !code) {
    return res.status(400).send("Missing required parameters");
  }

  try {
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code: code,
      }
    );

    const accessToken = tokenResponse.data.access_token;

    const { error } = await supabase
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
      throw error;
    }

    global.shopifyAccessToken = accessToken;
    global.shopName = shop;

    res.render('auth-success');
  } catch (error) {
    console.error("認証エラー:", error.response?.data || error.message);
    res
      .status(500)
      .send(
        "認証に失敗しました: " + (error.response?.data.error || error.message)
      );
  }
});

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

    res.json({
      message: "アラート設定を保存しました",
      data: data,
    });
  } catch (error) {
    console.error("アラート設定エラー:", error);
    res.status(400).json({
      error: "アラート設定の保存に失敗しました",
      details: error.message,
    });
  }
});

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
    console.error("取得エラー:", error);
    res.status(500).json({
      error: "アラート設定の取得に失敗しました",
      details: error.message,
    });
  }
});

app.get("/api/products", async (req, res) => {
  const { shop_name } = req.query;

  if (!shop_name) {
    return res.status(400).json({
      error: "shop_nameパラメータが必要です",
    });
  }

  try {
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

    const response = await axios.get(
      `https://${shop.shop_name}/admin/api/2025-01/products.json`,
      {
        headers: {
          "X-Shopify-Access-Token": shop.access_token,
        },
      }
    );

    const products = response.data.products.map((p) => ({
      id: p.id,
      title: p.title,
      inventory_quantity: p.variants.reduce(
        (sum, v) => sum + (v.inventory_quantity || 0),
        0
      ),
    }));

    res.json({ products });
  } catch (error) {
    console.error("商品取得エラー:", error.response?.data || error.message);
    res.status(500).json({
      error: "商品一覧の取得に失敗しました",
      details: error.message,
    });
  }
});

app.delete("/alert-settings/:id", async (req, res) => {
  const { id } = req.params;
  
  try {
    const { error } = await supabase
      .from("alert_settings")
      .delete()
      .eq("id", id);
    
    if (error) throw error;
    
    console.log(`✅ アラート設定を削除: ID ${id}`);
    
    res.json({
      message: "アラート設定を削除しました",
      id: id
    });
    
  } catch (error) {
    console.error("❌ 削除エラー:", error);
    res.status(500).json({
      error: "アラート設定の削除に失敗しました",
      details: error.message
    });
  }
});

app.put("/alert-settings/:id", async (req, res) => {
  const { id } = req.params;
  const { threshold, is_active } = req.body;

  if (threshold === undefined && is_active === undefined) {
    return res.status(400).json({
      error: "threshold または is_active が必要です",
    });
  }

  try {
    const updateData = {};
    if (threshold !== undefined) updateData.threshold = threshold;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from("alert_settings")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error) throw error;

    res.json({
      message: "アラート設定を更新しました",
      data: data,
    });
  } catch (error) {
    console.error("更新エラー:", error);
    res.status(500).json({
      error: "アラート設定の更新に失敗しました",
      details: error.message,
    });
  }
});

app.get("/check-inventory", async (req, res) => {
  const { shop_name } = req.query;

  if (!shop_name) {
    return res.status(400).json({
      error: "shop_nameパラメータが必要です",
    });
  }

  try {
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

    const alerts = [];

    for (const setting of settings) {
      try {
        const response = await axios.get(
          `https://${shop.shop_name}/admin/api/2025-01/products/${setting.product_id}.json`,
          {
            headers: {
              "X-Shopify-Access-Token": shop.access_token,
            },
          }
        );

        const product = response.data.product;
        const totalInventory = product.variants.reduce((sum, variant) => {
          return sum + (variant.inventory_quantity || 0);
        }, 0);

        if (totalInventory <= setting.threshold) {
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
        console.error(`商品ID ${setting.product_id} の取得エラー:`, error.response?.data || error.message);
        alerts.push({
          product_id: setting.product_id,
          error: error.response?.data?.errors || error.message,
        });
      }
    }

    const alertCount = alerts.filter(a => a.alerted).length;

    res.render('inventory-check-result', {
      shop_name: shop.shop_name,
      checked: settings.length,
      alertCount: alertCount,
      alerts: alerts
    });
  } catch (error) {
    console.error("在庫チェックエラー:", error);
    res.status(500).json({
      error: "在庫チェックに失敗しました",
      details: error.message,
    });
  }
});

app.get('/dashboard', async (req, res) => {
  const { shop_name } = req.query;
  
  if (!shop_name) {
    return res.render('dashboard', { 
      shop_name: null,
      settings: null,
      productsMap: {}
    });
  }
  
  try {
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('*')
      .eq('shop_name', shop_name)
      .single();
    
    if (shopError || !shop) {
      return res.render('error', {
        title: 'ストアが見つかりません',
        message: shop_name
      });
    }
    
    const { data: settings } = await supabase
      .from('alert_settings')
      .select('*')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false });

    let productsMap = {};
    if (settings && settings.length > 0) {
      try {
        const response = await axios.get(
          `https://${shop.shop_name}/admin/api/2025-01/products.json`,
          {
            headers: {
              'X-Shopify-Access-Token': shop.access_token
            }
          }
        );

        response.data.products.forEach(p => {
          productsMap[p.id] = p.title;
        });
      } catch (error) {
        console.error('❌ 商品情報取得エラー:', error);
      }
    }
    
    res.render('dashboard', {
      shop_name: shop_name,
      settings: settings,
      productsMap: productsMap
    });
    
  } catch (error) {
    res.render('error', {
      title: 'エラー',
      message: error.message
    });
  }
});

app.get("/products/shopify", async (req, res) => {
  try {
    const { data: shops, error } = await supabase
      .from("shops")
      .select("*")
      .limit(1)
      .single();

    if (error || !shops) {
      return res.status(401).render('auth-required');
    }

    const { shop_name, access_token } = shops;
    const response = await axios.get(
      `https://${shop_name}/admin/api/2025-01/products.json`,
      {
        headers: {
          "X-Shopify-Access-Token": access_token,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("API呼び出しエラー:", error.response?.data || error.message);
    res.status(500).json({
      error: "Shopify API呼び出しに失敗しました",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/", (req, res) => {
  res.render('index');
});

app.get("/products", (req, res) => {
  const products = [
    { id: 1, name: "Product A", price: 1000 },
    { id: 2, name: "Product B", price: 2000 },
  ];
  res.json(products);
});

app.post("/products", (req, res) => {
  const newProduct = req.body;

  if (!newProduct.name || !newProduct.price) {
    return res.status(400).json({
      error: "nameとpriceは必須です",
    });
  }

  if (typeof newProduct.price !== "number") {
    return res.status(400).json({
      error: "priceは数値である必要があります",
    });
  }

  res.json({
    message: "商品を追加しました",
    product: newProduct,
  });
});

app.get("/users", (req, res) => {
  const users = [
    { id: 1, name: "Sam", age: 19 },
    { id: 2, name: "Julia", age: 22 },
  ];
  res.json(users);
});

app.post("/users", (req, res) => {
  const newUser = req.body;

  res.json({
    message: "ユーザーを追加しました",
    user: newUser,
  });
});

app.get("/orders", (req, res) => {
  const orders = [
    { id: 1, userId: 1, productId: 1, quantity: 2, total: 2000 },
    { id: 2, userId: 2, productId: 2, quantity: 1, total: 2000 },
  ];
  res.json(orders);
});

app.post("/orders", (req, res) => {
  const newOrder = req.body;

  res.json({
    message: "注文を作成しました",
    user: newOrder,
  });
});

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

    await axios.post(process.env.SLACK_WEBHOOK_URL, message);

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

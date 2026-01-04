require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const { createClient } = require("@supabase/supabase-js");
const { error } = require("console");

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
  const { shop, code } = req.query;

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
// 商品一覧取得API 本番用（JSON形式で必要なデータだけを取得）
// ==================
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
    console.log("商品取得エラー:", error.response?.data || error.message);
    res.status(500).json({
      error: "商品一覧の取得に失敗しました",
      details: error.message,
    });
  }
});

// ==================
// DELETE API （削除機能）
// ==================
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

// ==================
// PUT API （更新機能）
// ==================
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

    console.log(`アラート設定を更新: ID ${id}`, data);

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

// ==================
// 在庫チェック&通知機能
// ==================
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

// ==================
// 管理画面
// ==================
app.get('/dashboard', async (req, res) => {
  const { shop_name } = req.query;
  
  if (!shop_name) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>在庫アラートダッシュボード</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            max-width: 800px; 
            margin: 50px auto; 
            padding: 20px; 
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 { color: #333; margin-top: 0; }
          input[type="text"] { 
            width: 100%; 
            padding: 12px; 
            font-size: 16px; 
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
          }
          button { 
            background: #5865F2; 
            color: white; 
            padding: 12px 24px; 
            border: none; 
            border-radius: 4px; 
            cursor: pointer; 
            font-size: 16px; 
            margin-top: 10px;
            width: 100%;
          }
          button:hover { background: #4752C4; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📦 在庫アラートダッシュボード</h1>
          <form action="/dashboard" method="GET">
            <label>ストア名:</label><br>
            <input type="text" name="shop_name" placeholder="store-xxxx.myshopify.com" required><br>
            <button type="submit">ダッシュボードを開く</button>
          </form>
        </div>
      </body>
      </html>
    `);
  }
  
  try {
    // ストア情報取得
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('*')
      .eq('shop_name', shop_name)
      .single();
    
    if (shopError || !shop) {
      return res.send(`
        <h1>❌ ストアが見つかりません</h1>
        <p>${shop_name}</p>
        <a href="/dashboard">戻る</a>
      `);
    }
    
    // アラート設定取得
    const { data: settings } = await supabase
      .from('alert_settings')
      .select('*')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false });

    // 商品情報を取得
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

        // 商品IDをキーにしたマップを作成
        response.data.products.forEach(p => {
          productsMap[p.id] = p.title;
        });
      } catch (error) {
        console.error('商品情報取得エラー:', error);
      }
    }
    
    // HTML生成
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>在庫アラートダッシュボード</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #f7f8fa;
            padding: 20px;
          }
          .container { max-width: 1200px; margin: 0 auto; }
          .header {
            background: white;
            padding: 24px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          h1 { color: #1a1a1a; font-size: 28px; margin-bottom: 8px; }
          .shop-name { color: #666; font-size: 14px; }
          
          .actions {
            background: white;
            padding: 24px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .btn {
            display: inline-block;
            padding: 10px 20px;
            border-radius: 6px;
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            margin-right: 10px;
            margin-bottom: 10px;
          }
          .btn-primary { background: #5865F2; color: white; }
          .btn-primary:hover { background: #4752C4; }
          .btn-secondary { background: #f0f0f0; color: #333; }
          .btn-secondary:hover { background: #e0e0e0; }
          .btn-success { background: #43b581; color: white; }
          .btn-success:hover { background: #3ca374; }
          
          .settings-section {
            background: white;
            padding: 24px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          h2 { font-size: 20px; margin-bottom: 20px; color: #1a1a1a; }
          
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
          }
          th {
            background: #f7f8fa;
            font-weight: 600;
            color: #666;
            font-size: 13px;
            text-transform: uppercase;
          }
          tr:hover { background: #f9f9f9; }
          
          .status-active { 
            color: #43b581; 
            font-weight: 600;
          }
          .status-inactive { 
            color: #f04747; 
            font-weight: 600;
          }
          
          .btn-small {
            padding: 6px 12px;
            font-size: 12px;
            border-radius: 4px;
            margin-right: 5px;
          }
          .btn-edit { background: #5865F2; color: white; }
          .btn-edit:hover { background: #4752C4; }
          .btn-delete { background: #f04747; color: white; }
          .btn-delete:hover { background: #d84040; }
          
          .empty-state {
            text-align: center;
            padding: 40px;
            color: #666;
          }
          
          /* モーダル */
          .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
          }
          .modal-content {
            background: white;
            max-width: 500px;
            margin: 100px auto;
            padding: 24px;
            border-radius: 8px;
          }
          .modal h3 { margin-bottom: 20px; }
          .form-group {
            margin-bottom: 16px;
          }
          label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
            font-size: 14px;
          }
          input, select {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
          }
          .modal-buttons {
            display: flex;
            gap: 10px;
            margin-top: 20px;
          }
          .modal-buttons button {
            flex: 1;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 在庫アラートダッシュボード</h1>
            <div class="shop-name">ストア: ${shop_name}</div>
          </div>
          
          <div class="actions">
            <button class="btn btn-success" onclick="openAddModal()">➕ 新規アラート設定</button>
            <a href="/check-inventory?shop_name=${encodeURIComponent(shop_name)}" class="btn btn-primary">🔍 在庫チェック実行</a>
            <a href="/dashboard" class="btn btn-secondary">🔙 別のストア</a>
          </div>
          
          <div class="settings-section">
            <h2>アラート設定 (${settings?.length || 0}件)</h2>
            
            ${settings && settings.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>商品</th>
                    <th>閾値</th>
                    <th>状態</th>
                    <th>作成日</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  ${settings.map(s => `
                    <tr>
                      <td>
                        ${productsMap[s.product_id] || 'ID: ' + s.product_id}
                        <br>
                        <small style="color: #999;">ID: ${s.product_id}</small>
                      </td>
                      <td>${s.threshold}個</td>
                      <td class="${s.is_active ? 'status-active' : 'status-inactive'}">
                        ${s.is_active ? '✅ 有効' : '❌ 無効'}
                      </td>
                      <td>${new Date(s.created_at).toLocaleDateString('ja-JP')}</td>
                      <td>
                        <button class="btn btn-small btn-edit" onclick="openEditModal(${s.id}, ${s.threshold}, ${s.is_active})">編集</button>
                        <button class="btn btn-small btn-delete" onclick="deleteSetting(${s.id})">削除</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `
              <div class="empty-state">
                <p>アラート設定がありません</p>
                <p>「新規アラート設定」ボタンから追加してください</p>
              </div>
            `}
          </div>
        </div>
        
        <!-- 追加モーダル -->
        <div id="addModal" class="modal">
          <div class="modal-content">
            <h3>新規アラート設定</h3>
            <form id="addForm">
              <div class="form-group">
                <label>商品を選択:</label>
                <select id="productSelect" required>
                  <option value="">読み込み中...</option>
                </select>
              </div>
              <div class="form-group">
                <label>閾値（在庫がこの数以下になったら通知）:</label>
                <input type="number" id="addThreshold" min="0" required>
              </div>
              <div class="modal-buttons">
                <button type="button" class="btn btn-secondary" onclick="closeAddModal()">キャンセル</button>
                <button type="submit" class="btn btn-success">追加</button>
              </div>
            </form>
          </div>
        </div>
        
        <!-- 編集モーダル -->
        <div id="editModal" class="modal">
          <div class="modal-content">
            <h3>アラート設定を編集</h3>
            <form id="editForm">
              <input type="hidden" id="editId">
              <div class="form-group">
                <label>閾値:</label>
                <input type="number" id="editThreshold" min="0" required>
              </div>
              <div class="form-group">
                <label>状態:</label>
                <select id="editActive">
                  <option value="true">有効</option>
                  <option value="false">無効</option>
                </select>
              </div>
              <div class="modal-buttons">
                <button type="button" class="btn btn-secondary" onclick="closeEditModal()">キャンセル</button>
                <button type="submit" class="btn btn-primary">更新</button>
              </div>
            </form>
          </div>
        </div>
        
        <script>
          const shopName = '${shop_name}';
          
          // 商品一覧を読み込む
          async function loadProducts() {
            try {
              const res = await fetch('/api/products?shop_name=' + encodeURIComponent(shopName));
              const data = await res.json();
              
              const select = document.getElementById('productSelect');
              select.innerHTML = '<option value="">商品を選択してください</option>';
              
              data.products.forEach(p => {
                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = p.title + ' (在庫: ' + p.inventory_quantity + '個)';
                select.appendChild(option);
              });
            } catch (error) {
              console.error('商品取得エラー:', error);
              alert('商品一覧の取得に失敗しました');
            }
          }
          
          // 追加モーダルを開く
          function openAddModal() {
            document.getElementById('addModal').style.display = 'block';
            loadProducts();
          }
          
          function closeAddModal() {
            document.getElementById('addModal').style.display = 'none';
          }
          
          // 編集モーダルを開く
          function openEditModal(id, threshold, isActive) {
            document.getElementById('editId').value = id;
            document.getElementById('editThreshold').value = threshold;
            document.getElementById('editActive').value = isActive.toString();
            document.getElementById('editModal').style.display = 'block';
          }
          
          function closeEditModal() {
            document.getElementById('editModal').style.display = 'none';
          }
          
          // 追加フォーム送信
          document.getElementById('addForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const productId = document.getElementById('productSelect').value;
            const threshold = parseInt(document.getElementById('addThreshold').value);
            
            try {
              const res = await fetch('/alert-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  shop_name: shopName,
                  product_id: parseInt(productId),
                  threshold: threshold
                })
              });
              
              if (res.ok) {
                alert('アラート設定を追加しました');
                location.reload();
              } else {
                const error = await res.json();
                alert('エラー: ' + error.error);
              }
            } catch (error) {
              console.error('追加エラー:', error);
              alert('追加に失敗しました');
            }
          });
          
          // 編集フォーム送信
          document.getElementById('editForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const id = document.getElementById('editId').value;
            const threshold = parseInt(document.getElementById('editThreshold').value);
            const isActive = document.getElementById('editActive').value === 'true';
            
            try {
              const res = await fetch('/alert-settings/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  threshold: threshold,
                  is_active: isActive
                })
              });
              
              if (res.ok) {
                alert('アラート設定を更新しました');
                location.reload();
              } else {
                const error = await res.json();
                alert('エラー: ' + error.error);
              }
            } catch (error) {
              console.error('更新エラー:', error);
              alert('更新に失敗しました');
            }
          });
          
          // 削除
          async function deleteSetting(id) {
            if (!confirm('本当に削除しますか？')) return;
            
            try {
              const res = await fetch('/alert-settings/' + id, {
                method: 'DELETE'
              });
              
              if (res.ok) {
                alert('アラート設定を削除しました');
                location.reload();
              } else {
                const error = await res.json();
                alert('エラー: ' + error.error);
              }
            } catch (error) {
              console.error('削除エラー:', error);
              alert('削除に失敗しました');
            }
          }
          
          // モーダル外クリックで閉じる
          window.onclick = function(event) {
            if (event.target.classList.contains('modal')) {
              event.target.style.display = 'none';
            }
          }
        </script>
      </body>
      </html>
    `);
    
  } catch (error) {
    res.status(500).send(`
      <h1>❌ エラー</h1>
      <p>${error.message}</p>
      <a href="/dashboard">戻る</a>
    `);
  }
});

// *-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-ここからデバック用エンドポイント*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-
// ==================
// 商品一覧取得API デバック・確認用
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

// GET：ルート
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

    await axios.post(process.env.SLACK_WEBHOOK_URL, message);

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

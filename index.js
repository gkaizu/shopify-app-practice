const express = require("express");
const app = express();
const PORT = 3000;

// JSONを受け取る設定（これがないとPOSTが動かない）
app.use(express.json());

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

const express = require('express');
const app = express();
const PORT = 3000;

// シンプルなGETエンドポイント
app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express'});
});

// 商品データを返すAPI（後でshopify APIに置き換える）
app.get('/products', (req, res) => {
  const products = [
    { id: 1, name: 'Product A', price: 1000 },
    { id: 2, name: 'Product B', price: 2000}
  ];
  res.json(products);
});

// 練習：ユーザー一覧
app.get('/users', (req, res) => {
  const users = [
    { id: 1, name: 'Sam', age: 19 },
    { id: 2, name: 'Julia', age: 22 }
  ];
  res.json(users);
});

// 練習：注文一覧
app.get('/orders', (req, res) => {
  const orders = [
    { id: 1, userId: 1, productId: 1, quantity: 2, total: 2000 },
    { id: 2, userId: 2, productId: 2, quantity: 1, total: 2000 }
  ];
  res.json(orders);
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
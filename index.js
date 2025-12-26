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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
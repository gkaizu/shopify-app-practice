const express = require('express');
const app = express();
const PORT = 3000;

// シンプルなGETエンドポイント
app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express'});
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
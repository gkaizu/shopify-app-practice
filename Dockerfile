# Node.js 20を使用
FROM node:20-alpine

# 作業ディレクトリを設定
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm install

# アプリのコードをコピー
COPY . .

# ポート3000を公開
EXPOSE 3000

# アプリを起動
CMD ["node", "index.js"]
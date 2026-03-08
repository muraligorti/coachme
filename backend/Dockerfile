FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install && npx prisma generate
COPY . .
EXPOSE 4000
CMD ["node", "src/server.js"]
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --production && npx prisma generate

FROM node:20-alpine
WORKDIR /app
RUN addgroup -S nexus && adduser -S nexus -G nexus
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY . .
RUN mkdir -p logs && chown -R nexus:nexus /app
USER nexus
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "src/server.js"]

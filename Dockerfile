# Образ приложения для сервера: собирается командой `docker compose up -d --build`
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# при каждом запуске докатываем новые миграции базы, затем стартуем сайт
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]

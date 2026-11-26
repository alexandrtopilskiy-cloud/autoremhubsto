# Образ приложения для сервера: собирается командой `docker compose up -d --build`
FROM golang:1.26.11-alpine AS workstation
WORKDIR /workstation
COPY workstation/ ./
RUN CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -buildvcs=false \
    -ldflags="-s -w -H=windowsgui" -o /out/AutoRemHub-PC.exe .

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
COPY --from=workstation /out/AutoRemHub-PC.exe ./public/downloads/AutoRemHub-PC.exe
# .git нужен только при сборке: по нему считается номер версии (next.config.ts)
RUN npm run build && rm -rf .git

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# при каждом запуске докатываем новые миграции базы, затем стартуем сайт
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]

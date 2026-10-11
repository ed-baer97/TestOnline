# syntax=docker/dockerfile:1.7

# ---------- Сборка клиента ----------
FROM node:22-bookworm-slim AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci --no-audit --no-fund
COPY client ./client
RUN cd client && npm run build

# ---------- Зависимости сервера ----------
FROM node:22-bookworm-slim AS server-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund

# ---------- Образ API ----------
FROM node:22-bookworm-slim AS app
ENV NODE_ENV=production \
    PORT=3001 \
    MEDIA_DIR=/data/media \
    NODE_OPTIONS=--no-warnings
WORKDIR /app
COPY --chown=node:node --from=server-deps /app/package.json ./package.json
COPY --chown=node:node --from=server-deps /app/server/node_modules ./server/node_modules
COPY --chown=node:node server/package.json ./server/
COPY --chown=node:node server/src ./server/src
# Клиент на случай, если приложение запущено без Nginx.
COPY --chown=node:node --from=client-build /app/client/dist ./client/dist
RUN mkdir -p /data/media && chown node:node /data /data/media
USER node
VOLUME ["/data/media"]
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/server
CMD ["node", "src/index.js"]

# ---------- Образ Nginx со статикой ----------
FROM nginx:1.27-alpine AS web
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=client-build /app/client/dist /usr/share/nginx/html

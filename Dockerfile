FROM node:24-slim AS build
# better-sqlite3 compiles from source when no prebuilt binary matches
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
ENV WEB_DIST=/app/web/dist
ENV DB_PATH=/app/data/split-checkout.db
RUN mkdir -p /app/data
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/web/dist web/dist
COPY package.json ./
EXPOSE 3001
CMD ["node", "server/dist/src/index.js"]

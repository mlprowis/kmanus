FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/bot/package.json ./packages/bot/
COPY packages/dashboard/package.json ./packages/dashboard/
COPY packages/notifier/package.json ./packages/notifier/

RUN npm_config_build_from_source=true npm ci

COPY . .

RUN npm run build --workspace=@grvt-grid/bot && \
    cd packages/dashboard && npx vite build && \
    mkdir -p /app/packages/bot/dist/dashboard/public && \
    cp -r /app/packages/dashboard/dist/. /app/packages/bot/dist/dashboard/public/

EXPOSE 3848

CMD ["node", "run.js"]

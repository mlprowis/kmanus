FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN apt-get update && apt-get install -y curl python3 make g++ && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/bot/package.json ./packages/bot/
COPY packages/dashboard/package.json ./packages/dashboard/
COPY packages/notifier/package.json ./packages/notifier/

RUN npm ci
RUN npm_config_build_from_source=true npm rebuild sqlite3

COPY . .

RUN npm run build --workspace=@grvt-grid/bot && \
    cd packages/dashboard && npx vite build && \
    mkdir -p /app/packages/bot/dist/dashboard/public && \
    cp -r /app/packages/dashboard/dist/. /app/packages/bot/dist/dashboard/public/

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 3848
CMD ["/app/start.sh"]

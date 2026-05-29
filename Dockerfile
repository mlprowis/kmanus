FROM node:22-bookworm-slim

WORKDIR /app

# Herramientas para compilar sqlite3 desde fuente
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copiar manifiestos de workspaces
COPY package.json package-lock.json ./
COPY packages/bot/package.json ./packages/bot/
COPY packages/dashboard/package.json ./packages/dashboard/
COPY packages/notifier/package.json ./packages/notifier/

# Forzar compilación nativa de sqlite3 (evita el error de GLIBC)
ENV npm_config_build_from_source=true
RUN npm ci

COPY . .

# Compilar bot (TypeScript)
RUN npm run build --workspace=@grvt-grid/bot

# Compilar dashboard (solo Vite, sin tsc)
RUN cd packages/dashboard && npx vite build

# Copiar frontend al directorio que espera el bot
RUN mkdir -p packages/bot/dist/dashboard/public && \
    cp -r packages/dashboard/dist/. packages/bot/dist/dashboard/public/

EXPOSE 3848

CMD ["sh", "-c", "node -e \"const fs=require('fs');fs.mkdirSync('/etc/grvt-grid',{recursive:true});fs.writeFileSync('/etc/grvt-grid/master.key',Buffer.from(process.env.MASTER_KEY_HEX,'hex'));\" && node packages/bot/dist/dashboard/server.js"]

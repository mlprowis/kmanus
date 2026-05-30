FROM node:22-bookworm-slim

# Herramientas para compilar sqlite3 desde código fuente
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar todo el código
COPY . .

# Instalar dependencias (compila sqlite3 desde fuente, sin problema de glibc)
RUN npm_config_build_from_source=true npm install

# Compilar TypeScript del bot
RUN npm run build --workspace=@grvt-grid/bot

# Compilar dashboard
RUN cd packages/dashboard && npx vite build

# Copiar dashboard a la ruta que busca el servidor
RUN mkdir -p /opt/grvt-grid-bot/dashboard-dist && \
    cp -r packages/dashboard/dist/. /opt/grvt-grid-bot/dashboard-dist/
    
EXPOSE 3848

CMD ["npm", "run", "start", "--workspace=@grvt-grid/bot"]

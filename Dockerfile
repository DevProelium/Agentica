# Etapa única: imagen Node.js ligera de producción
FROM node:20-alpine

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar manifiestos de dependencias primero (aprovecha caché de Docker)
COPY server/package*.json ./server/

# Instalar dependencias de producción
RUN cd server && npm install --omit=dev

# Copiar el resto del código
COPY server/ ./server/
COPY shared/ ./shared/
COPY swagger.yaml ./swagger.yaml

# Puerto expuesto por defecto
EXPOSE 3000

# Directorio de trabajo del proceso principal
WORKDIR /app/server

# Comando de arranque
CMD ["node", "app.js"]

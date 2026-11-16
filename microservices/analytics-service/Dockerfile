FROM node:24-alpine AS base

WORKDIR /usr/src/app

COPY microservices/shared ./microservices/shared
COPY microservices/analytics-service/package*.json ./microservices/analytics-service/

WORKDIR /usr/src/app/microservices/analytics-service
RUN npm install --omit=dev

COPY microservices/analytics-service ./

# Crear directorio de logs compartido para el sidecar de Fluent Bit
RUN mkdir -p /usr/src/app/logs && chown -R node:node /usr/src/app/logs

EXPOSE 5004

USER node

CMD ["node", "server.js"]


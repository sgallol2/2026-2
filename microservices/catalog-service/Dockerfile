FROM node:24-alpine AS base

WORKDIR /usr/src/app

COPY microservices/shared ./microservices/shared
COPY microservices/catalog-service/package*.json ./microservices/catalog-service/

WORKDIR /usr/src/app/microservices/catalog-service
RUN npm install --omit=dev

COPY microservices/catalog-service ./

EXPOSE 5002

USER node

CMD ["node", "server.js"]


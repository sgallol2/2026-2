FROM node:24-alpine AS base

WORKDIR /usr/src/app

COPY microservices/shared ./microservices/shared
COPY microservices/orders-service/package*.json ./microservices/orders-service/

WORKDIR /usr/src/app/microservices/orders-service
RUN npm install --omit=dev

COPY microservices/orders-service ./

EXPOSE 5003

USER node

CMD ["node", "server.js"]


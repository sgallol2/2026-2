FROM node:24-alpine AS base

WORKDIR /usr/src/app

COPY microservices/shared ./microservices/shared
COPY microservices/auth-service/package*.json ./microservices/auth-service/

WORKDIR /usr/src/app/microservices/auth-service
RUN npm install --omit=dev

COPY microservices/auth-service ./

EXPOSE 5001

USER node

CMD ["node", "server.js"]


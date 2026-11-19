FROM node:24-alpine AS base
WORKDIR /usr/src/app
COPY microservices/shared ./microservices/shared
RUN cd ./microservices/shared && npm install --omit=dev
COPY microservices/catalog-service ./microservices/catalog-service
WORKDIR /usr/src/app/microservices/catalog-service
RUN npm install --omit=dev
RUN ln -sfn /usr/src/app/microservices/shared /usr/src/app/microservices/catalog-service/shared
EXPOSE 5001 5002 5003 5004 50052
USER node
CMD ["node", "server.js"]

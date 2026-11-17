import express from "express";
import cors from "cors";

import { config } from "./src/config/env.js";
import { logger } from "../shared/logger.js";
import { errorHandler, notFoundHandler } from "../shared/errorHandler.js";
import { createDatabasePool } from "../shared/database.js";
import { createBookRepository } from "./src/repositories/bookRepository.js";
import { createBookController } from "./src/controllers/bookController.js";
import { createStockController } from "./src/controllers/stockController.js";
import { createBookRoutes } from "./src/routes/bookRoutes.js";
import { createStockGrpcServer } from "./src/grpc/stockGrpcServer.js";

const app = express();
const db = createDatabasePool(config);

const bookRepo = createBookRepository(db.pool);
const bookController = createBookController(bookRepo, config);
const stockController = createStockController(bookRepo, db.withTransaction);
const bookRoutes = createBookRoutes(bookController, stockController);

// Servidor gRPC para comunicación inter-microservicios (East-West)
const grpcServer = createStockGrpcServer({
  bookRepo,
  withTransaction: db.withTransaction,
  port: config.app.grpcPort,
});

app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Health check para Kubernetes Liveness / Readiness Probes
app.get("/health", async (req, res) => {
  try {
    await db.verifyConnection();
    res.status(200).json({ status: "ok", service: config.app.serviceName });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

// Rutas base HTTP (para consultas públicas)
app.use(`${config.app.apiBasePath}/books`, bookRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

let httpServer;

const start = async () => {
  await db.verifyConnection();

  // Iniciar servidor HTTP Express
  httpServer = app.listen(config.app.port, () => {
    logger.info("Catalog HTTP Service running on EKS", { port: config.app.port });
  });

  // Iniciar servidor gRPC
  await grpcServer.start();
};

const shutdown = async () => {
  logger.info("Catalog Service shutting down");
  if (httpServer) {
    httpServer.close();
  }
  await grpcServer.stop();
  await db.closeConnection();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start().catch((err) => {
  logger.error("Failed to start Catalog Service", { error: err.message });
  process.exit(1);
});

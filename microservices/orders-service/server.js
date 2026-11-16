import express from "express";
import cors from "cors";

import { config } from "./src/config/env.js";
import { logger } from "../shared/logger.js";
import { errorHandler, notFoundHandler } from "../shared/errorHandler.js";
import { createDatabasePool } from "../shared/database.js";
import { sessionContext } from "./src/middleware/sessionContext.js";
import { createCatalogClient } from "./src/clients/catalogClient.js";
import { createOrderRepository } from "./src/repositories/orderRepository.js";
import { createSagaOrchestrator } from "./src/services/sagaOrchestrator.js";
import { createOrderController } from "./src/controllers/orderController.js";
import { createOrderRoutes } from "./src/routes/orderRoutes.js";

const app = express();
const db = createDatabasePool(config);

const catalogClient = createCatalogClient(config.services.catalogServiceUrl);
const orderRepo = createOrderRepository(db.pool);
const sagaOrchestrator = createSagaOrchestrator({
  orderRepo,
  catalogClient,
  withTransaction: db.withTransaction,
});
const orderController = createOrderController(sagaOrchestrator, orderRepo, config);
const orderRoutes = createOrderRoutes(orderController);

app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(sessionContext);

// Health check para Kubernetes
app.get("/health", async (req, res) => {
  try {
    await db.verifyConnection();
    res.status(200).json({ status: "ok", service: config.app.serviceName });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

// Rutas de órdenes
app.use(`${config.app.apiBasePath}/orders`, orderRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(config.app.port, async () => {
  await db.verifyConnection();
  logger.info("Orders Service running on EKS (Saga Orchestrator Active)", {
    port: config.app.port,
    catalogServiceUrl: config.services.catalogServiceUrl,
  });
});

const shutdown = async () => {
  logger.info("Orders Service shutting down");
  server.close(async () => {
    await db.closeConnection();
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);


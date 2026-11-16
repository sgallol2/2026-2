import express from "express";
import cors from "cors";

import { config } from "./src/config/env.js";
import { logger } from "../shared/logger.js";
import { errorHandler, notFoundHandler } from "../shared/errorHandler.js";
import {
  initializeClickstreamFileWriter,
  closeClickstreamFileWriter,
} from "./src/logging/clickstreamFileWriter.js";
import { createEventController } from "./src/controllers/eventController.js";
import { createEventRoutes } from "./src/routes/eventRoutes.js";

const app = express();

const eventController = createEventController();
const eventRoutes = createEventRoutes(eventController);

app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Health check para Kubernetes Liveness / Readiness
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: config.app.serviceName });
});

// Rutas de eventos de analítica
app.use(`${config.app.apiBasePath}/events`, eventRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

let server;

const startServer = async () => {
  if (config.logging.clickstreamFileEnabled) {
    await initializeClickstreamFileWriter(config.logging.clickstreamFilePath);
  }

  server = app.listen(config.app.port, () => {
    logger.info("Analytics Service running on EKS (Sidecar Writer Active)", {
      port: config.app.port,
      logPath: config.logging.clickstreamFilePath,
    });
  });
};

const shutdown = async () => {
  logger.info("Analytics Service shutting down");
  if (server) {
    server.close(async () => {
      await closeClickstreamFileWriter();
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

startServer().catch((err) => {
  logger.error("Failed to start Analytics Service", { error: err.message });
  process.exit(1);
});


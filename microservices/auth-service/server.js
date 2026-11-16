import express from "express";
import cors from "cors";
import { parse } from "cookie";

import { config } from "./src/config/env.js";
import { logger } from "../shared/logger.js";
import { errorHandler, notFoundHandler } from "../shared/errorHandler.js";
import { createDatabasePool } from "../shared/database.js";
import { createAuthService } from "./src/services/authService.js";
import { createCustomerRepository } from "./src/repositories/customerRepository.js";
import { createAuthController } from "./src/controllers/authController.js";
import { createAuthRoutes } from "./src/routes/authRoutes.js";

const app = express();
const db = createDatabasePool(config);

const authService = createAuthService(config);
const customerRepo = createCustomerRepository(db.pool);
const authController = createAuthController(authService, customerRepo, config);
const authRoutes = createAuthRoutes(authController);

app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Middleware para extraer sesión si existe
app.use(async (req, res, next) => {
  const cookies = parse(req.headers.cookie ?? "");
  const token = cookies[config.auth.cookie.name];
  if (token) {
    try {
      req.auth = await authService.verifySessionToken(token);
    } catch {
      req.auth = null;
    }
  }
  next();
});

// Health check para Kubernetes
app.get("/health", async (req, res) => {
  try {
    await db.verifyConnection();
    res.status(200).json({ status: "ok", service: config.app.serviceName });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

app.use(`${config.app.apiBasePath}/auth`, authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(config.app.port, async () => {
  await db.verifyConnection();
  logger.info("Auth Service running on EKS", { port: config.app.port });
});

const shutdown = async () => {
  logger.info("Auth Service shutting down");
  server.close(async () => {
    await db.closeConnection();
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);


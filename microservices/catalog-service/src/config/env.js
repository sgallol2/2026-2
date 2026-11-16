import "dotenv/config";

const parsePositiveInteger = (name, defaultValue) => {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : defaultValue;
};

const parseBoolean = (name, defaultValue) => {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return raw.trim().toLowerCase() === "true";
};

export const config = {
  app: {
    serviceName: process.env.SERVICE_NAME || "catalog-service",
    port: parsePositiveInteger("PORT", 5002),
    corsOrigins: (process.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim()),
    apiBasePath: process.env.API_BASE_PATH || "/api/v1",
  },
  db: {
    host: process.env.DB_HOST || "localhost",
    port: parsePositiveInteger("DB_PORT", 5432),
    name: process.env.DB_NAME || "bookstore",
    user: process.env.APP_DB_USER || process.env.DB_USER || "bookstore_app",
    password: process.env.APP_DB_PASSWORD || process.env.DB_PASSWORD,
    ssl: parseBoolean("DB_SSL", true),
    sslRejectUnauthorized: parseBoolean("DB_SSL_REJECT_UNAUTHORIZED", false),
    poolMax: parsePositiveInteger("DB_POOL_MAX", 10),
    idleTimeoutMs: parsePositiveInteger("DB_IDLE_TIMEOUT_MS", 30000),
    connectionTimeoutMs: parsePositiveInteger("DB_CONNECTION_TIMEOUT_MS", 5000),
  },
  books: {
    defaultLimit: parsePositiveInteger("BOOKS_DEFAULT_LIMIT", 24),
    maxLimit: parsePositiveInteger("BOOKS_MAX_LIMIT", 100),
  },
};


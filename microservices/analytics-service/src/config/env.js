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
    serviceName: process.env.SERVICE_NAME || "analytics-service",
    port: parsePositiveInteger("PORT", 5004),
    corsOrigins: (process.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim()),
    apiBasePath: process.env.API_BASE_PATH || "/api/v1",
  },
  logging: {
    clickstreamFileEnabled: parseBoolean("CLICKSTREAM_FILE_ENABLED", true),
    clickstreamFilePath:
      process.env.CLICKSTREAM_FILE_PATH || "/usr/src/app/logs/clickstream.log",
  },
};


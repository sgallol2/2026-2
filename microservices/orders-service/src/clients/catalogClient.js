import { logger } from "../../shared/logger.js";
import { AppError } from "../../shared/AppError.js";

export const createCatalogClient = (catalogServiceUrl) => {
  const reserveStock = async (orderId, items) => {
    const url = `${catalogServiceUrl}/api/v1/books/reserve-stock`;
    logger.info("Calling Catalog Service to reserve stock", { orderId, url });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, items }),
        signal: AbortSignal.timeout(5000),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new AppError(
          data?.error?.message || data?.message || "Failed to reserve book stock",
          response.status === 409 ? 409 : 502,
          data?.error?.code || "STOCK_RESERVATION_FAILED"
        );
      }

      return data;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error("Error communicating with Catalog Service", { error: err.message });
      throw new AppError(
        `Catalog service unavailable: ${err.message}`,
        503,
        "CATALOG_SERVICE_UNAVAILABLE"
      );
    }
  };

  const releaseStock = async (orderId, items) => {
    const url = `${catalogServiceUrl}/api/v1/books/release-stock`;
    logger.info("Calling Catalog Service to release stock (compensation)", { orderId, url });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, items }),
        signal: AbortSignal.timeout(5000),
      });

      return await response.json().catch(() => ({}));
    } catch (err) {
      logger.error("Compensating action releaseStock failed", { orderId, error: err.message });
      // En Sagas avanzadas se guarda en DLQ o reintentos periódicos
    }
  };

  return {
    reserveStock,
    releaseStock,
  };
};


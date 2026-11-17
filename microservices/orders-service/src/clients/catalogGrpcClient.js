import path from "node:path";
import { fileURLToPath } from "node:url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { logger } from "../../shared/logger.js";
import { AppError } from "../../shared/AppError.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.resolve(__dirname, "../../../shared/proto/stock.proto");

export const createCatalogGrpcClient = (catalogGrpcUrl) => {
  logger.info("Initializing gRPC Client to Catalog Service", { catalogGrpcUrl });

  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const stockProto = grpc.loadPackageDefinition(packageDefinition).bookstore.stock;

  const client = new stockProto.StockService(
    catalogGrpcUrl,
    grpc.credentials.createInsecure()
  );

  /**
   * Invoca el RPC ReserveStock en catalog-service (T2 de la Saga)
   */
  const reserveStock = (orderId, items) => {
    return new Promise((resolve, reject) => {
      const protoItems = items.map((i) => ({
        book_id: i.bookId || i.book_id,
        quantity: Number(i.quantity),
      }));

      logger.info("gRPC: Invoking ReserveStock on Catalog", { orderId, itemCount: protoItems.length });

      client.ReserveStock(
        { order_id: orderId, items: protoItems },
        { deadline: Date.now() + 5000 },
        (err, response) => {
          if (err) {
            logger.warn("gRPC: ReserveStock failed", { orderId, error: err.message, code: err.code });

            if (err.code === grpc.status.FAILED_PRECONDITION) {
              return reject(new AppError(err.details || err.message, 409, "INSUFFICIENT_STOCK"));
            }

            return reject(
              new AppError(
                `Catalog gRPC communication failed: ${err.details || err.message}`,
                503,
                "CATALOG_SERVICE_UNAVAILABLE"
              )
            );
          }

          logger.info("gRPC: ReserveStock succeeded", { orderId, reserved: response.reserved_items?.length });
          resolve(response);
        }
      );
    });
  };

  /**
   * Invoca el RPC ReleaseStock en catalog-service (C2 de la Saga - Compensación)
   */
  const releaseStock = (orderId, items) => {
    return new Promise((resolve) => {
      const protoItems = items.map((i) => ({
        book_id: i.bookId || i.book_id,
        quantity: Number(i.quantity),
      }));

      logger.info("gRPC: Invoking ReleaseStock (Compensation) on Catalog", { orderId });

      client.ReleaseStock(
        { order_id: orderId, items: protoItems },
        { deadline: Date.now() + 5000 },
        (err, response) => {
          if (err) {
            logger.error("gRPC: ReleaseStock error", { orderId, error: err.message });
            return resolve({ success: false, error: err.message });
          }

          logger.info("gRPC: ReleaseStock succeeded", { orderId, releasedCount: response.released_count });
          resolve(response);
        }
      );
    });
  };

  return {
    reserveStock,
    releaseStock,
  };
};


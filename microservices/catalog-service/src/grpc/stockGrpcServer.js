import path from "node:path";
import { fileURLToPath } from "node:url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { logger } from "../../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.resolve(__dirname, "../../../shared/proto/stock.proto");

export const createStockGrpcServer = ({ bookRepo, withTransaction, port }) => {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const stockProto = grpc.loadPackageDefinition(packageDefinition).bookstore.stock;
  const server = new grpc.Server();

  // Implementación del RPC ReserveStock (T2 de la Saga)
  const reserveStock = async (call, callback) => {
    const { order_id, items } = call.request;
    logger.info("gRPC: ReserveStock received", { order_id, itemCount: items?.length });

    if (!Array.isArray(items) || items.length === 0) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: "Items list cannot be empty",
      });
    }

    try {
      const reservedItems = await withTransaction(async (client) => {
        const reserved = [];

        for (const item of items) {
          const bookId = item.book_id;
          const quantity = Number(item.quantity);

          const updated = await bookRepo.decreaseBookStock({ bookId, quantity }, client);

          if (!updated) {
            const books = await bookRepo.findBooksByIds([bookId], client);
            const title = books[0]?.title || bookId;
            const error = new Error(`Insufficient stock for "${title}"`);
            error.code = "INSUFFICIENT_STOCK";
            throw error;
          }

          reserved.push({
            book_id: bookId,
            quantity,
            remaining_stock: updated.stock,
          });
        }

        return reserved;
      });

      callback(null, {
        success: true,
        order_id,
        message: "Stock successfully reserved via gRPC",
        reserved_items: reservedItems,
      });

    } catch (err) {
      logger.warn("gRPC: ReserveStock failed", { order_id, error: err.message });
      callback({
        code: grpc.status.FAILED_PRECONDITION,
        message: err.message,
      });
    }
  };

  // Implementación del RPC ReleaseStock (C2 - Compensación de la Saga)
  const releaseStock = async (call, callback) => {
    const { order_id, items } = call.request;
    logger.info("gRPC: ReleaseStock (Compensation) received", { order_id, itemCount: items?.length });

    if (!Array.isArray(items) || items.length === 0) {
      return callback(null, {
        success: true,
        order_id,
        message: "No items to release",
        released_count: 0,
      });
    }

    try {
      let releasedCount = 0;
      await withTransaction(async (client) => {
        for (const item of items) {
          const bookId = item.book_id;
          const quantity = Number(item.quantity);
          if (bookId && quantity > 0) {
            await bookRepo.increaseBookStock({ bookId, quantity }, client);
            releasedCount++;
          }
        }
      });

      callback(null, {
        success: true,
        order_id,
        message: "Stock successfully released via gRPC (Compensated)",
        released_count: releasedCount,
      });

    } catch (err) {
      logger.error("gRPC: ReleaseStock error", { order_id, error: err.message });
      callback({
        code: grpc.status.INTERNAL,
        message: err.message,
      });
    }
  };

  server.addService(stockProto.StockService.service, {
    ReserveStock: reserveStock,
    ReleaseStock: releaseStock,
  });

  const start = () =>
    new Promise((resolve, reject) => {
      server.bindAsync(
        `0.0.0.0:${port}`,
        grpc.ServerCredentials.createInsecure(),
        (err, boundPort) => {
          if (err) return reject(err);
          logger.info("Catalog gRPC Server running", { port: boundPort });
          resolve(boundPort);
        }
      );
    });

  const stop = () =>
    new Promise((resolve) => {
      server.tryShutdown(() => {
        logger.info("Catalog gRPC Server stopped");
        resolve();
      });
    });

  return {
    start,
    stop,
  };
};


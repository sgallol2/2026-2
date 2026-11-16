import { ORDER_STATUSES } from "../config/orders.js";
import { logger } from "../../shared/logger.js";
import { AppError } from "../../shared/AppError.js";

export const createSagaOrchestrator = ({ orderRepo, catalogClient, withTransaction }) => {
  /**
   * Ejecuta la Saga de compra de libros (Orquestación en EKS).
   *
   * @param {Object} params
   * @param {string} params.customerId - ID del cliente autenticado
   * @param {Array<{ bookId: string, quantity: number }>} params.items - Libros a comprar
   * @returns {Promise<Object>} Orden final confirmada
   */
  const placeOrderSaga = async ({ customerId, items }) => {
    logger.info("Starting Order Placement Saga", { customerId, itemCount: items.length });

    // PASO 1 (T1): Crear la orden localmente en estado PENDING
    const pendingOrder = await withTransaction(async (client) => {
      return await orderRepo.createPendingOrder({ customerId, items }, client);
    });

    const orderId = pendingOrder.order_id;
    logger.info("Saga Step 1 (T1) completed: Order created in PENDING state", { orderId });

    try {
      // PASO 2 (T2): Invocar Catalog Service por CoreDNS para reservar el stock
      logger.info("Saga Step 2 (T2): Requesting stock reservation from Catalog Service", { orderId });
      await catalogClient.reserveStock(orderId, items);
      logger.info("Saga Step 2 (T2) completed: Stock reserved in Catalog", { orderId });

      // PASO 3 (T3): Confirmar la orden a PLACED
      const confirmedOrder = await orderRepo.updateOrderStatus(orderId, ORDER_STATUSES.PLACED);
      logger.info("Saga Step 3 (T3) completed: Order marked as PLACED", { orderId });

      return confirmedOrder;

    } catch (error) {
      logger.warn("Saga Step 2/3 failed. Triggering Compensating Actions...", {
        orderId,
        error: error.message,
        code: error.code,
      });

      // ACCIÓN COMPENSATORIA C1: Cancelar la orden local
      await orderRepo.updateOrderStatus(orderId, ORDER_STATUSES.CANCELLED);
      logger.info("Compensating action C1 executed: Order marked as CANCELLED", { orderId });

      // Si el fallo ocurrió DESPUÉS de haber reservado stock, liberar existencias (C2):
      if (error.code !== "INSUFFICIENT_STOCK") {
        await catalogClient.releaseStock(orderId, items);
        logger.info("Compensating action C2 executed: Stock released back to Catalog", { orderId });
      }

      // Propagar el error descriptivo al cliente HTTP
      throw error;
    }
  };

  return {
    placeOrderSaga,
  };
};


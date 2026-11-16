import { AppError } from "../../shared/AppError.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeItems = (rawItems, maxItems, maxQuantity) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new AppError("The order must contain at least one item", 400, "INVALID_ORDER");
  }

  if (rawItems.length > maxItems) {
    throw new AppError(`The order cannot contain more than ${maxItems} distinct items`, 400, "INVALID_ORDER");
  }

  const seenBookIds = new Set();

  return rawItems.map((rawItem) => {
    if (!rawItem || typeof rawItem !== "object") {
      throw new AppError("Invalid item in order", 400, "INVALID_ORDER");
    }

    const bookId = String(rawItem.book_id || rawItem.bookId || "").trim().toLowerCase();
    const quantity = Number(rawItem.quantity);

    if (!bookId || !UUID_PATTERN.test(bookId)) {
      throw new AppError("Invalid book ID format", 400, "INVALID_ORDER");
    }

    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > maxQuantity) {
      throw new AppError(`Quantity must be between 1 and ${maxQuantity}`, 400, "INVALID_ORDER");
    }

    if (seenBookIds.has(bookId)) {
      throw new AppError("The same book cannot appear multiple times in an order", 400, "INVALID_ORDER");
    }

    seenBookIds.add(bookId);

    return { bookId, quantity };
  });
};

export const createOrderController = (sagaOrchestrator, orderRepo, config) => {
  const createOrder = async (req, res) => {
    const customerId = req.auth?.customerId;
    if (!customerId) {
      throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
    }

    const items = normalizeItems(
      req.body?.items,
      config.orders.maxDistinctItems,
      config.orders.maxQuantityPerItem
    );

    // Orquesta la creación de orden con el Patrón Saga
    const order = await sagaOrchestrator.placeOrderSaga({ customerId, items });

    res.status(201).json(order);
  };

  const getOrders = async (req, res) => {
    const customerId = req.auth?.customerId;
    const orders = await orderRepo.findOrdersByCustomerId(customerId);
    res.status(200).json(orders);
  };

  const getOrderById = async (req, res) => {
    const customerId = req.auth?.customerId;
    const orderId = req.params.orderId?.trim();

    if (!orderId || !UUID_PATTERN.test(orderId)) {
      throw new AppError("Invalid order ID", 400, "INVALID_ORDER_ID");
    }

    const order = await orderRepo.findOrderByIdForCustomer({ orderId, customerId });
    if (!order) {
      throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    }

    const items = await orderRepo.findOrderItemsByOrderId(orderId);
    res.status(200).json({ ...order, items });
  };

  return {
    createOrder,
    getOrders,
    getOrderById,
  };
};


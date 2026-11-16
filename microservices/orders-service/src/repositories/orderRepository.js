import { ORDER_STATUSES } from "../config/orders.js";

export const createOrderRepository = (dbPool) => {
  const createPendingOrder = async ({ customerId, items }, client) => {
    // 1. Insertar orden en PENDING
    const orderQuery = `
      INSERT INTO orders (customer_id, order_status, total_amount)
      VALUES ($1, $2, 0)
      RETURNING order_id, customer_id, order_status, total_amount, order_timestamp
    `;
    const orderRes = await client.query(orderQuery, [customerId, ORDER_STATUSES.PENDING]);
    const order = orderRes.rows[0];

    // 2. Obtener precios de los libros para calcular total
    const bookIds = items.map((i) => i.bookId);
    const booksRes = await client.query(
      `SELECT book_id, price FROM books WHERE book_id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [bookIds]
    );
    const priceMap = new Map(booksRes.rows.map((b) => [b.book_id, Number(b.price)]));

    let calculatedTotal = 0;
    for (const item of items) {
      const unitPrice = priceMap.get(item.bookId) || 0;
      calculatedTotal += unitPrice * item.quantity;

      await client.query(
        `INSERT INTO order_items (order_id, book_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [order.order_id, item.bookId, item.quantity, unitPrice]
      );
    }

    // 3. Actualizar total de la orden
    await client.query(
      `UPDATE orders SET total_amount = $1 WHERE order_id = $2`,
      [calculatedTotal, order.order_id]
    );

    order.total_amount = calculatedTotal;
    return order;
  };

  const updateOrderStatus = async (orderId, newStatus, executor = dbPool) => {
    const query = `
      UPDATE orders
      SET order_status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE order_id = $1
      RETURNING order_id, customer_id, order_status, total_amount, order_timestamp, updated_at
    `;
    const { rows } = await executor.query(query, [orderId, newStatus]);
    return rows[0] ?? null;
  };

  const findOrdersByCustomerId = async (customerId, executor = dbPool) => {
    const query = `
      SELECT
        o.order_id,
        o.order_status,
        o.total_amount,
        o.order_timestamp,
        COALESCE(SUM(oi.quantity), 0)::INTEGER AS total_quantity
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.order_id
      WHERE o.customer_id = $1 AND o.deleted_at IS NULL
      GROUP BY o.order_id, o.order_status, o.total_amount, o.order_timestamp
      ORDER BY o.order_timestamp DESC
    `;
    const { rows } = await executor.query(query, [customerId]);
    return rows;
  };

  const findOrderByIdForCustomer = async ({ orderId, customerId }, executor = dbPool) => {
    const query = `
      SELECT
        o.order_id,
        o.customer_id,
        o.order_status,
        o.total_amount,
        o.order_timestamp
      FROM orders o
      WHERE o.order_id = $1 AND o.customer_id = $2 AND o.deleted_at IS NULL
      LIMIT 1
    `;
    const { rows } = await executor.query(query, [orderId, customerId]);
    return rows[0] ?? null;
  };

  const findOrderItemsByOrderId = async (orderId, executor = dbPool) => {
    const query = `
      SELECT
        oi.order_item_id,
        oi.book_id,
        b.title AS book_title,
        oi.quantity,
        oi.unit_price,
        oi.line_total
      FROM order_items oi
      JOIN books b ON b.book_id = oi.book_id
      WHERE oi.order_id = $1
      ORDER BY b.title ASC
    `;
    const { rows } = await executor.query(query, [orderId]);
    return rows;
  };

  return {
    createPendingOrder,
    updateOrderStatus,
    findOrdersByCustomerId,
    findOrderByIdForCustomer,
    findOrderItemsByOrderId,
  };
};


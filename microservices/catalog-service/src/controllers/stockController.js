import { AppError } from "../../shared/AppError.js";

export const createStockController = (bookRepo, withTransaction) => {
  /**
   * POST /api/v1/books/reserve-stock
   * Transacción local de la Saga (T2):
   * Reserva y descuenta stock atómicamente para los libros solicitados.
   */
  const reserveStock = async (req, res) => {
    const { items, orderId } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError("Items array is required for stock reservation", 400, "INVALID_ITEMS");
    }

    const reserved = await withTransaction(async (client) => {
      const reservedBooks = [];

      for (const item of items) {
        const bookId = item.bookId || item.book_id;
        const quantity = Number(item.quantity);

        if (!bookId || !quantity || quantity <= 0) {
          throw new AppError("Each item must have a valid bookId and positive quantity", 400, "INVALID_ITEM");
        }

        const updated = await bookRepo.decreaseBookStock({ bookId, quantity }, client);

        if (!updated) {
          // Obtener título para mensaje claro
          const books = await bookRepo.findBooksByIds([bookId], client);
          const title = books[0]?.title || bookId;
          throw new AppError(
            `Insufficient stock for "${title}"`,
            409,
            "INSUFFICIENT_STOCK"
          );
        }

        reservedBooks.push({
          bookId,
          quantity,
          remainingStock: updated.stock,
        });
      }

      return reservedBooks;
    });

    res.status(200).json({
      success: true,
      orderId,
      reserved,
      message: "Stock successfully reserved",
    });
  };

  /**
   * POST /api/v1/books/release-stock
   * Acción Compensatoria de la Saga (C2):
   * Devuelve existencias al inventario si la orden se cancela.
   */
  const releaseStock = async (req, res) => {
    const { items, orderId } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError("Items array is required for stock release", 400, "INVALID_ITEMS");
    }

    await withTransaction(async (client) => {
      for (const item of items) {
        const bookId = item.bookId || item.book_id;
        const quantity = Number(item.quantity);

        if (bookId && quantity > 0) {
          await bookRepo.increaseBookStock({ bookId, quantity }, client);
        }
      }
    });

    res.status(200).json({
      success: true,
      orderId,
      message: "Stock successfully released (compensated)",
    });
  };

  return {
    reserveStock,
    releaseStock,
  };
};


const BOOK_COLUMNS = `
  book_id,
  isbn,
  title,
  author,
  description,
  category,
  publisher,
  publication_year,
  price,
  stock,
  image,
  created_at,
  updated_at
`;

export const createBookRepository = (dbPool) => {
  const findBooks = async ({ limit, offset }, executor = dbPool) => {
    const query = `
      SELECT ${BOOK_COLUMNS}
      FROM books
      WHERE deleted_at IS NULL
      ORDER BY title ASC
      LIMIT $1 OFFSET $2
    `;
    const { rows } = await executor.query(query, [limit, offset]);
    return rows;
  };

  const findBookByIsbn = async (isbn, executor = dbPool) => {
    const query = `
      SELECT ${BOOK_COLUMNS}
      FROM books
      WHERE isbn = $1 AND deleted_at IS NULL
      LIMIT 1
    `;
    const { rows } = await executor.query(query, [isbn]);
    return rows[0] ?? null;
  };

  const findBooksByIds = async (bookIds, executor = dbPool) => {
    const query = `
      SELECT book_id, isbn, title, price, stock
      FROM books
      WHERE book_id = ANY($1::uuid[]) AND deleted_at IS NULL
    `;
    const { rows } = await executor.query(query, [bookIds]);
    return rows;
  };

  // Decremento atómico comprobando existencia de stock (para T2 de Saga)
  const decreaseBookStock = async ({ bookId, quantity }, executor = dbPool) => {
    const query = `
      UPDATE books
      SET stock = stock - $2, updated_at = CURRENT_TIMESTAMP
      WHERE book_id = $1
        AND deleted_at IS NULL
        AND stock >= $2
      RETURNING book_id, title, stock
    `;
    const { rows } = await executor.query(query, [bookId, quantity]);
    return rows[0] ?? null;
  };

  // Incremento atómico (Acción compensatoria C2 de Saga)
  const increaseBookStock = async ({ bookId, quantity }, executor = dbPool) => {
    const query = `
      UPDATE books
      SET stock = stock + $2, updated_at = CURRENT_TIMESTAMP
      WHERE book_id = $1
        AND deleted_at IS NULL
      RETURNING book_id, title, stock
    `;
    const { rows } = await executor.query(query, [bookId, quantity]);
    return rows[0] ?? null;
  };

  return {
    findBooks,
    findBookByIsbn,
    findBooksByIds,
    decreaseBookStock,
    increaseBookStock,
  };
};


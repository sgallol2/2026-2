const CUSTOMER_COLUMNS = `
  customer_id,
  first_name,
  last_name,
  email,
  city,
  country,
  created_at,
  updated_at
`;

export const createCustomerRepository = (dbPool) => {
  const findCustomerByEmail = async (email, executor = dbPool) => {
    const query = `
      SELECT ${CUSTOMER_COLUMNS}
      FROM customers
      WHERE LOWER(email) = LOWER(BTRIM($1))
        AND deleted_at IS NULL
      LIMIT 1
    `;
    const { rows } = await executor.query(query, [email]);
    return rows[0] ?? null;
  };

  const findCustomerById = async (customerId, executor = dbPool) => {
    const query = `
      SELECT ${CUSTOMER_COLUMNS}
      FROM customers
      WHERE customer_id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `;
    const { rows } = await executor.query(query, [customerId]);
    return rows[0] ?? null;
  };

  return {
    findCustomerByEmail,
    findCustomerById,
  };
};


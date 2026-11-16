import pg from "pg";

const { Pool } = pg;

export const createDatabasePool = (envConfig) => {
  const ssl =
    envConfig.db.ssl
      ? { rejectUnauthorized: envConfig.db.sslRejectUnauthorized }
      : false;

  const pool = new Pool({
    host: envConfig.db.host,
    port: envConfig.db.port,
    database: envConfig.db.name,
    user: envConfig.db.user,
    password: envConfig.db.password,
    ssl,
    max: envConfig.db.poolMax || 10,
    idleTimeoutMillis: envConfig.db.idleTimeoutMs || 30000,
    connectionTimeoutMillis: envConfig.db.connectionTimeoutMs || 5000,
  });

  const verifyConnection = async () => {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
  };

  const closeConnection = async () => {
    await pool.end();
  };

  const withTransaction = async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  return {
    pool,
    verifyConnection,
    closeConnection,
    withTransaction,
  };
};


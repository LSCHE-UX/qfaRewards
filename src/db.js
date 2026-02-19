const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway")
    ? { rejectUnauthorized: false }
    : false,
});

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      discord_user_id BIGINT UNIQUE NOT NULL,
      roblox_user_id BIGINT UNIQUE,
      roblox_username TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wallets (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
      lifetime_earned INT NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
      lifetime_spent INT NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS link_codes (
      discord_user_id BIGINT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_discord_user_id BIGINT,
      type TEXT NOT NULL,
      amount INT NOT NULL,
      reason TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("Database tables ready ✅");
}

async function query(text, params) {
  return pool.query(text, params);
}

async function withTx(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  query,
  withTx,
  initDatabase,
};
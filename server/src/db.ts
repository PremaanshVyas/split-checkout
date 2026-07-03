import Database from "better-sqlite3";

/**
 * SQLite for the demo (see DECISIONS.md). The schema is written as it
 * would be in Postgres; swapping is a driver change, not a redesign.
 */
export function openDatabase(path = process.env.DB_PATH ?? "split-checkout.db"): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_groups (
      id                 TEXT PRIMARY KEY,
      merchant_order_ref TEXT NOT NULL UNIQUE,
      total_amount       REAL NOT NULL,
      currency           TEXT NOT NULL,
      status             TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','partially_authorized','authorized','captured','failed')),
      created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS payment_slots (
      id                  TEXT PRIMARY KEY,
      order_group_id      TEXT NOT NULL REFERENCES order_groups(id),
      airwallex_intent_id TEXT NOT NULL,
      amount              REAL NOT NULL,
      status              TEXT NOT NULL DEFAULT 'created'
                          CHECK (status IN ('created','authorized','captured','failed','cancelled')),
      last_error_code     TEXT,
      created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_payment_slots_group ON payment_slots(order_group_id);

    CREATE TABLE IF NOT EXISTS order_items (
      id             TEXT PRIMARY KEY,
      order_group_id TEXT NOT NULL REFERENCES order_groups(id),
      sku            TEXT NOT NULL,
      name           TEXT NOT NULL,
      unit_price     REAL NOT NULL,
      quantity       INTEGER NOT NULL,
      color          TEXT,
      created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_order_items_group ON order_items(order_group_id);

    CREATE TABLE IF NOT EXISTS mandates (
      id          TEXT PRIMARY KEY,
      code        TEXT NOT NULL UNIQUE,
      max_amount  REAL NOT NULL,
      remaining   REAL NOT NULL,
      currency    TEXT NOT NULL DEFAULT 'AUD',
      cards       TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS refunds (
      id                  TEXT PRIMARY KEY,
      slot_id             TEXT NOT NULL REFERENCES payment_slots(id),
      airwallex_refund_id TEXT NOT NULL,
      amount              REAL NOT NULL,
      status              TEXT NOT NULL,
      created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_refunds_slot ON refunds(slot_id);
  `);

  return db;
}

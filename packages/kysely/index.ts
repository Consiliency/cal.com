import { Kysely, ParseJSONResultsPlugin, PostgresDialect, DeduplicateJoinsPlugin } from "kysely";
import { Pool } from "pg";

import type { DB, Booking } from "./types";

export type { DB, Booking };

const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:@localhost:5450/calendso";

const pool = new Pool({
  connectionString,
  // Limit connections to prevent exhausting database connection pool
  max: 5, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// 3. Create the Dialect, passing the configured pool instance
const dialect = new PostgresDialect({
  pool: pool, // Use the pool instance created above
});

// 4. Create the Kysely instance as before
const db = new Kysely<DB>({
  dialect,
  plugins: [new ParseJSONResultsPlugin(), new DeduplicateJoinsPlugin()],
});

export default db;

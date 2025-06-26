// scripts/test_db_connection.js
require("dotenv").config({ path: ".env" });
const { Client } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

const client = new Client({ connectionString });

client
  .connect()
  .then(() => {
    console.log("✅ Successfully connected to the database!");
    return client.query("SELECT NOW()");
  })
  .then((res) => {
    console.log("Current time from DB:", res.rows[0]);
    return client.end();
  })
  .catch((err) => {
    console.error("❌ Failed to connect to the database:", err.message);
    process.exit(1);
  });

import postgres from "postgres";

const connectionString = process.env.JMAIL_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "JMAIL_DATABASE_URL is not set. Add it to .env.local with your Jmail database connection string."
  );
}

// Read-only connection to the Jmail archive database.
// Uses raw `postgres` driver (no Drizzle) to leverage search_vector, raw_json, and complex queries.
const jmail = postgres(connectionString, {
  max: 5,              // connection pool size
  idle_timeout: 30,    // close idle connections after 30s
  connect_timeout: 10, // fail fast if DB unreachable
});

export { jmail };

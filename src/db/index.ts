import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Create a .env.local file with your connection string."
  );
}

// For query purposes, use a single shared connection per server instance.
// The `postgres` driver handles pooling internally.
const client = postgres(connectionString);

export const db = drizzle(client, { schema });

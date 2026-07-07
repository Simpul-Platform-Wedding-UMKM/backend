import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// In dev, `node --watch` restarts the process on file change, which can
// otherwise spin up a fresh PrismaClient (and a fresh connection pool)
// every reload. Stashing it on globalThis avoids that.
const globalForPrisma = globalThis;

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // PgBouncer transaction mode doesn't support prepared statements
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    options: process.env.PGOPTIONS,
  });

  pool.on("error", (err) => {
    // Prevent uncaught errors from crashing the process if a client goes
    // idle while we have no active request (common with PgBouncer).
    console.error("[pg pool] idle client error:", err.message);
  });

  const schemaMatch = process.env.DATABASE_URL ? process.env.DATABASE_URL.match(/[?&]schema=([^&]+)/) : null;
  const schema = schemaMatch ? schemaMatch[1] : undefined;

  const adapter = new PrismaPg(pool, { schema });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

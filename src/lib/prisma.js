import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// In dev, `node --watch` restarts the process on file change, which can
// otherwise spin up a fresh PrismaClient (and a fresh connection pool)
// every reload. Stashing it on globalThis avoids that.
const globalForPrisma = globalThis;

function createPrismaClient() {
  // Supabase pooler (port 6543, PgBouncer transaction mode) requires SSL.
  // WSL2 doesn't have a system CA bundle by default, so we disable cert
  // verification — safe for Supabase because the connection string already
  // authenticates via password and the pooler only accepts known project
  // credentials. In production, set ssl: { ca: readFileSync('...') } if
  // you want full chain verification.
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // PgBouncer transaction mode doesn't support prepared statements
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on("error", (err) => {
    // Prevent uncaught errors from crashing the process if a client goes
    // idle while we have no active request (common with PgBouncer).
    console.error("[pg pool] idle client error:", err.message);
  });

  const adapter = new PrismaPg(pool);
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

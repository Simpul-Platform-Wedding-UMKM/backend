/**
 * Safety guards untuk E2E — mencegah resetDB/truncate menyentuh production.
 *
 * Aturan (WAJIB semua lolos sebelum test jalan):
 *   1. `ALLOW_DB_RESET=true` harus eksplisit (tidak ada default aman).
 *   2. `DATABASE_URL` & `SUPABASE_URL` tidak boleh mengandung host production
 *      yang dikenal (blocklist). Deteksi dari:
 *        - env `PRODUCTION_DATABASE_HOST` / `PRODUCTION_SUPABASE_URL` (CI),
 *        - file non-secret `e2e.safety.json` (substring host, bukan kredensial).
 *   3. `DATABASE_URL` harus menunjuk ke project Supabase staging (allowlist
 *      project ref dari `E2E_STAGING_PROJECT_REF` atau file safety).
 *
 * Gagal = throw dengan pesan jelas (test tidak boleh jalan).
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Load non-secret safety config (optional) ─────────────────────────────────
function loadSafetyConfig() {
  const path = join(HERE, "e2e.safety.json");
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

const config = loadSafetyConfig();

// ── Production hosts — dari env CI atau file safety (bukan dari secret) ──────
// Dibaca per-call (bukan saat module load) agar test bisa ubah env dinamis.
function prodDbHosts() {
  return [
    process.env.PRODUCTION_DATABASE_HOST,
    config.productionDatabaseHost,
  ].filter(Boolean);
}

function prodSupabaseUrls() {
  return [
    process.env.PRODUCTION_SUPABASE_URL,
    config.productionSupabaseUrl,
  ].filter(Boolean);
}

// Staging project ref (substring yang harus ada di DATABASE_URL).
function stagingRefs() {
  return [
    process.env.E2E_STAGING_PROJECT_REF,
    config.stagingProjectRef,
  ].filter(Boolean);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url ?? "";
  }
}

/**
 * Verifikasi environment aman untuk reset DB.
 * Throw Error dengan pesan jelas kalau tidak aman.
 * Return host DB (redacted) untuk log.
 */
export function assertSafeE2EEnv() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const allowReset = process.env.ALLOW_DB_RESET === "true";

  if (!dbUrl) {
    throw new Error(
      "E2E Safety: DATABASE_URL tidak diset. E2E melakukan truncate — wajib arahkan ke DB staging, bukan production.",
    );
  }
  if (!allowReset) {
    throw new Error(
      "E2E Safety: ALLOW_DB_RESET=true wajib diset untuk menjalankan E2E (yang melakukan truncate). JANGAN set di production.",
    );
  }

  // Blocklist: prod host muncul di URL → hard fail.
  const dbHost = hostOf(dbUrl);
  const supabaseHost = hostOf(supabaseUrl);
  for (const host of prodDbHosts()) {
    if (dbHost.includes(host)) {
      throw new Error(
        `E2E Safety: DATABASE_URL menunjuk ke host production yang dikenal ("${host}"). E2E menolak jalan — truncate dilarang di production.`,
      );
    }
  }
  for (const url of prodSupabaseUrls()) {
    if (supabaseUrl && supabaseUrl.includes(url)) {
      throw new Error(
        "E2E Safety: SUPABASE_URL menunjuk ke Supabase production yang dikenal. E2E menolak jalan.",
      );
    }
  }

  // Allowlist: staging ref harus ada di DATABASE_URL (kalau dikonfigurasi).
  const refs = stagingRefs();
  if (refs.length > 0) {
    const ok = refs.some((ref) => dbUrl.includes(ref));
    if (!ok) {
      throw new Error(
        `E2E Safety: DATABASE_URL tidak mengandung project ref staging yang dikenal (${refs.join(" / ")}). E2E hanya jalan terhadap staging.`,
      );
    }
  }

  return dbHost.replace(/:[^@]*@/, ":****@"); // redact password
}

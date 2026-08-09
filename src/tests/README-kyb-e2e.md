# E2E Test — Loop KYB Consumer → Backend → Admin

Verifikasi kontrak lengkap loop verifikasi vendor lewat HTTP API (bukan UI):

```
Vendor submit dokumen (multipart) → Backend upload ke Supabase → status PENDING
Admin list & detail verifikasi (data real, tanpa mock)
Admin approve → Vendor lihat VERIFIED
Admin reject + reason → Vendor lihat REJECTED
Validasi negatif: submit tanpa file → 400, approve tanpa admin → 401/403
```

> ## ⚠️ PENTING — SAFETY GUARD
>
> Test ini **me-truncate SEMUA tabel** (`resetDB`). Sebelum jalan, `src/tests/safety.js`
> memverifikasi:
> 1. `ALLOW_DB_RESET=true` diset eksplisit (default TIDAK ada),
> 2. `DATABASE_URL` / `SUPABASE_URL` **tidak** mengandung host production
>    (blocklist dari `PRODUCTION_DATABASE_HOST` / `PRODUCTION_SUPABASE_URL`
>    atau `src/tests/e2e.safety.json`),
> 3. (opsional) `DATABASE_URL` mengandung staging project ref dari
>    `E2E_STAGING_PROJECT_REF` / `e2e.safety.json`.
>
> Jika guard gagal → test **refuse to run** dengan pesan jelas. JANGAN pernah
> set `ALLOW_DB_RESET=true` pada environment yang memakai database production.
> Selalu arahkan test ke Supabase project staging/test yang terpisah
> (lihat `docs/ci-cd-staging.md`).

## Prasyarat

1. **Backend berjalan** terhadap **test/staging database** (`DATABASE_URL` — file test memanggil `resetDB()` yang me-truncate semua tabel, jadi JANGAN pakai DB production). Lihat `docs/ci-cd-staging.md` untuk setup Supabase staging.
2. **Supabase storage terkonfigurasi** di env backend:
   - `SUPABASE_URL` (project URL, mis. `https://xxxx.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY` (service role key)
   - `SUPABASE_BUCKET` (default `avatars`)
   - Tanpa ini, test upload di-`skip` dengan pesan jelas — bukan silent pass.
3. **Mock admin OFF** — `SHOULD_MOCK` default `false` (jangan set `NEXT_PUBLIC_USE_MOCK=true`).

## Menjalankan

```bash
cd backend
ALLOW_DB_RESET=true npm run test:e2e:kyb
# atau seluruh suite:
ALLOW_DB_RESET=true npm test
```

## Env vars

Test membaca env dari `.env` backend (via `dotenv` di `vitest.config.js`) dan `process.env`:

| Var | Wajib? | Dipakai untuk |
|-----|--------|---------------|
| `DATABASE_URL` | ✅ | Test DB (resetDB truncate semua tabel!) — WAJIB staging |
| `ALLOW_DB_RESET` | ✅ | Harus `true` — guard anti-production |
| `SUPABASE_URL` | ✅ untuk upload | Upload dokumen KYB |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ untuk upload | Upload dokumen KYB |
| `SUPABASE_BUCKET` | opsional | Default `avatars` |
| `TEST_API_URL` | opsional | Remote env (Vercel) — kalau set, test jalan terhadap URL itu |
| `PRODUCTION_DATABASE_HOST` | opsional (CI) | Host DB prod untuk blocklist |
| `PRODUCTION_SUPABASE_URL` | opsional (CI) | Supabase prod untuk blocklist |
| `E2E_STAGING_PROJECT_REF` | opsional | Project ref staging yang harus ada di `DATABASE_URL` |

Credential test (admin & vendor) **dibuat dinamis** oleh test via `POST /auth/register/consumer` + update role di DB — tidak ada password hardcoded selain fixture `password123` (sudah dipakai seluruh suite existing).

## Apa yang diverifikasi

| Skenario | Assert |
|----------|--------|
| Submit tanpa file | 400 (KTP/NPWP wajib) |
| Submit multipart ktp+npwp | 200, status `PENDING` |
| URL dokumen di DB | `http(s)://`, mengandung `/kyb/`, **bukan** path lokal (`/data/user/...`) |
| Admin list `?status=PENDING` | Berisi vendor yang baru submit, status `PENDING` |
| Admin detail | Punya `ktpUrl` / `npwpUrl` |
| Admin approve | `PATCH /vendors/:id` → vendor lihat `VERIFIED` + `kybVerified: true` |
| Admin reject + reason | Vendor lihat `REJECTED` + `rejectedReason` |
| Approve tanpa token | 401 |
| Approve pakai token vendor | 403 |

## Endpoint aktual yang dipakai

| Fungsi | Method + Path | Auth |
|--------|---------------|------|
| Register consumer | `POST /auth/register/consumer` | — |
| Login | `POST /auth/login` | — |
| Apply vendor | `POST /vendors/apply` | Bearer vendor |
| Submit KYB | `POST /vendors/me/verify` (multipart: `ktp`, `npwp` wajib; `siup`, `mou` opsional) | Bearer vendor |
| Status KYB vendor | `GET /vendors/me/verification` | Bearer vendor |
| List verifikasi | `GET /vendor-verifications?status=` (tanpa prefix `/admin` — admin router di-mount di `/`) | Bearer admin |
| Detail verifikasi | `GET /vendor-verifications/:id` | Bearer admin |
| Approve / Reject | `PATCH /vendors/:id` `{kybStatus, kybVerified, rejectedReason?}` | Bearer admin |

## Troubleshooting

| Gejala | Kemungkinan penyebab |
|--------|---------------------|
| Test upload di-`skip` | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` kosong — isi di `.env` backend |
| `500` saat upload | Supabase bucket belum dibuat / key salah — cek bucket `avatars` public |
| `401` login | Mock bcrypt beda env — jalankan via `npm test` (setup.js mock bcrypt aktif) |
| `404 /vendor-verifications` | Backend lama / route belum di-deploy — cek `admin.routes.js` |
| List verifikasi kosong | Vendor belum submit, atau filter `status` salah |
| `403` approve | Token bukan role ADMIN (test ini memang menguji 403) |
| `resetDB` menghapus data | **Wajar** — pakai test DB, jangan production |

## Catatan

- Fixture dokumen = PNG 1×1 transparan (~70 bytes) di-generate in-memory — bukan file binary besar.
- Test **tidak** menyentuh production code — hanya folder `src/tests/`.
- `getVerificationLogs` (dashboard) masih return `[]` — tabel log belum ada; bukan bagian dari test ini.

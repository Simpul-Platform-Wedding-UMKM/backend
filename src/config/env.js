import dotenv from "dotenv";

dotenv.config();

if (!process.env.JWT_SECRET) {
    throw new Error("Missing required env var: JWT_SECRET");
}

export const env = {
    port: Number(process.env.PORT ?? 4000),
    allowedOrigins: (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || "").split(",").filter(Boolean),
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",

    // Google Sign-In — Web Client ID dari GCP Console
    // Digunakan untuk memverifikasi idToken dari mobile app secara kriptografis.
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? null,

    // Supabase Storage — profile photo uploads
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    supabaseBucket: process.env.SUPABASE_BUCKET ?? "avatars",

    pjpProvider: process.env.PJP_PROVIDER ?? "xendit",
    xenditSecretKey: process.env.XENDIT_SECRET_KEY,
    xenditCallbackToken: process.env.XENDIT_CALLBACK_TOKEN,
    midtransMerchantId: process.env.MIDTRANS_MERCHANT_ID,
    midtransServerKey: process.env.MIDTRANS_SERVER_KEY,
    midtransIsProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
    midtransSnapBaseUrl:
        process.env.MIDTRANS_SNAP_BASE_URL ?? "https://app.sandbox.midtrans.com",

    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    aiServiceUrl: process.env.AI_SERVICE_URL ?? "http://localhost:8000",

    platformFeeBps: Number(process.env.PLATFORM_FEE_BPS ?? 75), // 75 bps = 0.75%, mid-point of the proposal's 0.5–1%
};

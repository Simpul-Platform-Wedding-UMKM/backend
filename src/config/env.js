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

    pjpProvider: process.env.PJP_PROVIDER ?? "xendit",
    xenditSecretKey: process.env.XENDIT_SECRET_KEY,
    xenditCallbackToken: process.env.XENDIT_CALLBACK_TOKEN,
    midtransServerKey: process.env.MIDTRANS_SERVER_KEY,
    midtransIsProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",

    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",

    platformFeeBps: Number(process.env.PLATFORM_FEE_BPS ?? 75), // 75 bps = 0.75%, mid-point of the proposal's 0.5–1%
};

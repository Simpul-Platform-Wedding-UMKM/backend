import "dotenv/config";

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  jwtSecret: required("JWT_SECRET"),
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

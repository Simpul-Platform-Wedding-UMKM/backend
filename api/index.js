// Vercel Serverless Function entry point.
// Vercel expects a default export of an Express app (or compatible handler).
// We re-use the same app configured in src/app.js — no duplication needed.
import { app } from "../src/app.js";

export default app;

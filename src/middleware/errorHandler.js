export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Wrap async route handlers so thrown errors reach errorHandler instead of
// crashing the process: router.get('/x', asyncHandler(async (req, res) => {...}))
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Zod validation errors → 400 Bad Request.
  // Check err.name instead of instanceof ZodError — more robust across
  // Zod v3/v4 and ESM module boundaries where instanceof can silently fail.
  if (err?.name === "ZodError") {
    const issues = err.issues ?? err.errors ?? [];
    const message = issues
      .map((e) => {
        const path = Array.isArray(e.path) && e.path.length ? `${e.path.join(".")}: ` : "";
        return `${path}${e.message}`;
      })
      .join(", ");
    return res.status(400).json({ error: message || "Validation failed" });
  }

  const status = err.status ?? 500;
  if (status === 500) {
    console.error(err);
  }
  res.status(status).json({ error: err.message ?? "Internal server error" });
}

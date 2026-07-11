import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

// GET /system-users — returns all accounts mapped to the SystemUser shape
// the admin dashboard expects.
export const getSystemUsers = asyncHandler(async (req, res) => {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const users = accounts.map((a) => ({
    id: a.id,
    email: a.email,
    name: a.fullName,
    role: mapRole(a.role),
    permissions: [],
    isActive: true,
    lastLoginAt: null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  res.json(users);
});

function mapRole(prismaRole) {
  if (prismaRole === "ADMIN") return "ADMIN";
  if (prismaRole === "CONSUMER") return "ANALYST";
  return "ANALYST";
}

// GET /audit-logs — no audit-log table exists yet in the Prisma schema.
// Returns an empty array so the admin dashboard's audit-log page renders
// without errors. Add an AuditLog model + migration when audit tracking is
// implemented.
export const getAuditLogs = asyncHandler(async (req, res) => {
  res.json([]);
});

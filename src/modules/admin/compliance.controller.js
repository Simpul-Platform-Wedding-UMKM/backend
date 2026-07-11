import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

// GET /compliance-checks — derives compliance status from vendor KYB + bank info.
// No dedicated ComplianceCheck table exists yet; this synthesises results
// from the Vendor model so the admin dashboard renders without errors.
export const getComplianceChecks = asyncHandler(async (req, res) => {
  const vendors = await prisma.vendor.findMany({
    select: {
      id: true,
      accountId: true,
      businessName: true,
      kybVerified: true,
      bankName: true,
      bankAccountNumber: true,
      bankAccountName: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const checks = vendors.map((v) => {
    const hasBank = !!(v.bankName && v.bankAccountNumber && v.bankAccountName);
    const isCompliant = v.kybVerified && hasBank;
    return {
      id: v.id,
      vendorId: v.id,
      category: "KYB_KYC",
      status: isCompliant ? "PASSED" : v.kybVerified ? "WARNING" : "FAILED",
      riskLevel: isCompliant ? "LOW" : "MEDIUM",
      description: isCompliant
        ? `Vendor ${v.businessName} is KYB verified with complete bank details.`
        : v.kybVerified
          ? `Vendor ${v.businessName} is KYB verified but missing bank details.`
          : `Vendor ${v.businessName} has not completed KYB verification.`,
      findings: isCompliant ? "" : "KYB or bank details incomplete",
      checkedAt: v.createdAt.toISOString(),
      createdAt: v.createdAt.toISOString(),
    };
  });

  res.json(checks);
});

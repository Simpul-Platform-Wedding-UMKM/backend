import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

// GET /locations — public, no auth
// Returns deduplicated, normalized, sorted list of all known location/region
// values from wedding_projects and vendors, for use as autocomplete suggestions.
// ponytail: UNION query does dedup + sort in one round-trip.
export const listLocations = asyncHandler(async (req, res) => {
    const rows = await prisma.$queryRawUnsafe(`
        SELECT INITCAP(TRIM(location)) AS name
        FROM wedding_projects
        WHERE location IS NOT NULL AND TRIM(location) != ''
        UNION
        SELECT INITCAP(TRIM(region)) AS name
        FROM vendors
        WHERE region IS NOT NULL AND TRIM(region) != ''
        ORDER BY name ASC
    `);
    res.json({ locations: rows.map((r) => r.name) });
});

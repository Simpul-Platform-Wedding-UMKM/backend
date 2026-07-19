/**
 * Shared location/region normalization.
 *
 * Rules:
 *   1. null/undefined → null
 *   2. whitespace-only → null
 *   3. Otherwise: trim → title-case each word → return
 *
 * "title-case each word" means: first character uppercase, rest lowercase.
 * This covers standard Indonesian kecamatan names (Purwokerto, Baturraden,
 * Karanglewas, etc.) — no special-case handling needed for hyphens or
 * conjunctions in the Banyumas Raya context.
 *
 * ponytail: simple split-map-join, no regex dependency.
 */
export function normalizeLocation(val) {
    if (val === undefined) return undefined; // preserve "not provided" for PATCH semantics
    if (val === null) return null;
    const trimmed = String(val).trim();
    if (trimmed === "") return null;
    return trimmed
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
}

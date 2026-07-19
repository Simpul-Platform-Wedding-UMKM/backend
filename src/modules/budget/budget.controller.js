import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";
import { CATEGORIES } from "../../lib/categories.js";
import { normalizeLocation } from "../../lib/location.js";

const createProjectSchema = z.object({
    eventDate: z.string().datetime({ offset: true }).optional(),
    guestCount: z.number().int().positive().optional(),
    location: z.string().optional().transform(normalizeLocation),
    themePref: z.string().optional(),
    totalBudget: z.number().int().nonnegative().default(0),
});

export const createWeddingProject = asyncHandler(async (req, res) => {
    const data = createProjectSchema.parse(req.body);
    const project = await prisma.weddingProject.create({
        data: {
            ...data,
            eventDate: data.eventDate ? new Date(data.eventDate) : undefined,
            accountId: req.account.id,
        },
    });
    res.status(201).json(project);
});

export const getMyWeddingProjects = asyncHandler(async (req, res) => {
    const projects = await prisma.weddingProject.findMany({
        where: { accountId: req.account.id },
        include: { budgetAllocations: true },
        orderBy: { createdAt: "desc" },
    });
    res.json(projects);
});

const allocationSchema = z.object({
    allocations: z.array(
        z.object({
            category: z.enum(CATEGORIES),
            plannedAmount: z.number().int().nonnegative(),
        }),
    ),
});

// Upsert the full allocation set in one call — simpler for the frontend
// than N separate PATCH requests, and this is exactly the "Budget Planner"
// interaction: user drags sliders across categories and saves once.
export const setBudgetAllocations = asyncHandler(async (req, res) => {
    const { allocations } = allocationSchema.parse(req.body);

    const project = await prisma.weddingProject.findFirst({
        where: { id: req.params.projectId, accountId: req.account.id },
    });
    if (!project) throw new ApiError(404, "Wedding project not found");

    const planned = allocations.reduce((sum, a) => sum + a.plannedAmount, 0);
    if (planned > project.totalBudget) {
        throw new ApiError(
            422,
            "Allocations exceed total budget — this is the overbudgeting check",
        );
    }

    await prisma.$transaction(
        allocations.map((a) =>
            prisma.budgetAllocation.upsert({
                where: {
                    weddingProjectId_category: {
                        weddingProjectId: project.id,
                        category: a.category,
                    },
                },
                update: { plannedAmount: a.plannedAmount },
                create: {
                    weddingProjectId: project.id,
                    category: a.category,
                    plannedAmount: a.plannedAmount,
                },
            }),
        ),
    );

    const updated = await prisma.budgetAllocation.findMany({
        where: { weddingProjectId: project.id },
    });
    res.json(updated);
});

// ---------------------------------------------------------------------------
// Gap E: manual expense logging
// ---------------------------------------------------------------------------

async function assertProject(projectId, accountId) {
    const project = await prisma.weddingProject.findFirst({
        where: { id: projectId, accountId },
    });
    if (!project) throw new ApiError(404, "Wedding project not found");
    return project;
}

const expenseSchema = z.object({
    category: z.enum(CATEGORIES),
    title: z.string().min(1).max(120),
    amount: z.number().int().positive(),
});

// POST /budget/projects/:projectId/expenses
export const addExpense = asyncHandler(async (req, res) => {
    const data = expenseSchema.parse(req.body);
    await assertProject(req.params.projectId, req.account.id);
    const expense = await prisma.budgetExpense.create({
        data: { ...data, weddingProjectId: req.params.projectId },
    });
    res.status(201).json(expense);
});

// GET /budget/projects/:projectId/expenses
export const listExpenses = asyncHandler(async (req, res) => {
    await assertProject(req.params.projectId, req.account.id);
    const expenses = await prisma.budgetExpense.findMany({
        where: { weddingProjectId: req.params.projectId },
        orderBy: { createdAt: "desc" },
    });
    res.json(expenses);
});

// ── Update Wedding Project ────────────────────────────────────────────────

const updateProjectSchema = z.object({
    totalBudget: z.number().int().nonnegative().optional(),
    eventDate: z.string().datetime({ offset: true }).optional(),
    guestCount: z.number().int().positive().optional(),
    location: z.string().optional().transform(normalizeLocation),
    themePref: z.string().optional(),
});

// ── Update Wedding Project
// PATCH /budget/projects/:projectId
// Only updates provided fields — can't change accountId
export const updateWeddingProject = asyncHandler(async (req, res) => {
    const data = updateProjectSchema.parse(req.body);

    const project = await prisma.weddingProject.findFirst({
        where: { id: req.params.projectId, accountId: req.account.id },
    });
    if (!project) throw new ApiError(404, "Wedding project not found");

    const updated = await prisma.weddingProject.update({
        where: { id: req.params.projectId },
        data: {
            ...data,
            eventDate: data.eventDate ? new Date(data.eventDate) : undefined,
        },
    });
    res.json(updated);
});

// ── Budget Summary (per-category planned vs spent) ─────────────────────────
// GET /budget/projects/:projectId/summary
// Single source of truth for the Cart ↔ Budget Planner UI:
// - plannedAmount from BudgetAllocation
// - spent → manualExpenses from BudgetExpense (real-time SUM)
// - spent → bookings from PaymentSplit.vendorAmount+platformFeeAmount
//   (only PAID payments — exact amount user has actually paid, not approximate %)
export const getProjectSummary = asyncHandler(async (req, res) => {
    const project = await prisma.weddingProject.findFirst({
        where: { id: req.params.projectId, accountId: req.account.id },
        include: { budgetAllocations: true },
    });
    if (!project) throw new ApiError(404, "Wedding project not found");

    const { totalBudget, budgetAllocations } = project;

    // 1) Manual expenses — grouped by category
    const expenseAgg = await prisma.budgetExpense.groupBy({
        by: ["category"],
        where: { weddingProjectId: project.id },
        _sum: { amount: true },
    });

    // 2) Booking spend — what the user actually paid (vendorAmount + fees),
    //    only for settled payments (status = PAID)
    const paidSplits = await prisma.paymentSplit.findMany({
        where: {
            payment: { status: "PAID" },
            bookingItem: {
                booking: { weddingProjectId: project.id },
            },
        },
        select: {
            vendorAmount: true,
            platformFeeAmount: true,
            bookingItem: {
                select: {
                    vendor: { select: { category: true } },
                },
            },
        },
    });

    // Build lookup maps
    const expenseMap = {};
    for (const e of expenseAgg) {
        expenseMap[e.category] = e._sum.amount || 0;
    }

    const bookingMap = {};
    for (const s of paidSplits) {
        const cat = s.bookingItem.vendor.category;
        bookingMap[cat] =
            (bookingMap[cat] || 0) + s.vendorAmount + s.platformFeeAmount;
    }

    const allocMap = {};
    for (const a of budgetAllocations) {
        allocMap[a.category] = a.plannedAmount;
    }

    // Merge all known categories
    const allCategories = [
        ...new Set([
            ...Object.keys(allocMap),
            ...Object.keys(expenseMap),
            ...Object.keys(bookingMap),
        ]),
    ];

    const categories = allCategories.map((cat) => {
        const planned = allocMap[cat] || 0;
        const manualExpenses = expenseMap[cat] || 0;
        const bookings = bookingMap[cat] || 0;
        const total = manualExpenses + bookings;
        return {
            category: cat,
            plannedAmount: planned,
            spent: { manualExpenses, bookings, total },
            remaining: planned - total,
        };
    });

    const totalAllocated = Object.values(allocMap).reduce((a, b) => a + b, 0);
    const totalSpent = categories.reduce((s, c) => s + c.spent.total, 0);

    res.json({
        totalBudget,
        categories,
        totals: {
            allocated: totalAllocated,
            spent: totalSpent,
            unallocated: totalBudget - totalAllocated,
            remaining: totalBudget - totalSpent,
        },
    });
});

import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

const createProjectSchema = z.object({
  eventDate: z.string().datetime().optional(),
  guestCount: z.number().int().positive().optional(),
  location: z.string().optional(),
  themePref: z.string().optional(),
  totalBudget: z.number().int().positive(),
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
  });
  res.json(projects);
});

const allocationSchema = z.object({
  allocations: z.array(
    z.object({
      category: z.enum([
        "MUA",
        "CATERING",
        "DECORATION",
        "PHOTOGRAPHY",
        "ATTIRE",
        "WEDDING_ORGANIZER",
        "VENUE",
        "OTHER",
      ]),
      plannedAmount: z.number().int().nonnegative(),
    })
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
    throw new ApiError(422, "Allocations exceed total budget — this is the overbudgeting check");
  }

  await prisma.$transaction(
    allocations.map((a) =>
      prisma.budgetAllocation.upsert({
        where: { weddingProjectId_category: { weddingProjectId: project.id, category: a.category } },
        update: { plannedAmount: a.plannedAmount },
        create: { weddingProjectId: project.id, category: a.category, plannedAmount: a.plannedAmount },
      })
    )
  );

  const updated = await prisma.budgetAllocation.findMany({ where: { weddingProjectId: project.id } });
  res.json(updated);
});

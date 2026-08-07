import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

async function resolveProject(accountId, projectId) {
  if (projectId) {
    const project = await prisma.weddingProject.findFirst({
      where: { id: projectId, accountId },
    });
    if (!project) throw new ApiError(404, "Wedding project not found");
    return project.id;
  }
  const project = await prisma.weddingProject.findFirst({
    where: { accountId },
    orderBy: { createdAt: "asc" },
  });
  if (!project) {
    throw new ApiError(400, "Buat proyek anggaran terlebih dahulu");
  }
  return project.id;
}

async function loadItemForUser(itemId, accountId) {
  const item = await prisma.moodboardItem.findUnique({
    where: { id: itemId },
    include: { weddingProject: true },
  });
  if (!item) throw new ApiError(404, "Moodboard item not found");
  if (item.weddingProject.accountId !== accountId) {
    throw new ApiError(403, "Not your moodboard item");
  }
  return item;
}

// GET /moodboard?projectId=
export const listMoodboardItems = asyncHandler(async (req, res) => {
  const projectId = await resolveProject(req.account.id, req.query.projectId);
  const items = await prisma.moodboardItem.findMany({
    where: { weddingProjectId: projectId },
    orderBy: { createdAt: "desc" },
  });
  res.json(items);
});

// POST /moodboard — { projectId?, title, category, imageUrl }
const createItemSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  imageUrl: z.string().url(),
});
export const createMoodboardItem = asyncHandler(async (req, res) => {
  const data = createItemSchema.parse(req.body);
  const projectId = await resolveProject(req.account.id, data.projectId);
  const item = await prisma.moodboardItem.create({
    data: {
      weddingProjectId: projectId,
      title: data.title,
      category: data.category,
      imageUrl: data.imageUrl,
    },
  });
  res.status(201).json(item);
});

// DELETE /moodboard/:id
export const deleteMoodboardItem = asyncHandler(async (req, res) => {
  await loadItemForUser(req.params.id, req.account.id);
  await prisma.moodboardItem.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

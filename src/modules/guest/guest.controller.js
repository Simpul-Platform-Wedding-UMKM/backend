import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError, asyncHandler } from "../../middleware/errorHandler.js";

// Helper: resolve the wedding project scope. Accepts an explicit projectId,
// otherwise falls back to the user's first project (same convention as the app).
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

async function loadGuestForUser(guestId, accountId) {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    include: { weddingProject: true },
  });
  if (!guest) throw new ApiError(404, "Guest not found");
  if (guest.weddingProject.accountId !== accountId) {
    throw new ApiError(403, "Not your guest");
  }
  return guest;
}

const rsvpEnum = z.enum(["HADIR", "TIDAK_HADIR", "MENUNGGU"]);

// GET /guests?projectId=
export const listGuests = asyncHandler(async (req, res) => {
  const projectId = await resolveProject(req.account.id, req.query.projectId);
  const guests = await prisma.guest.findMany({
    where: { weddingProjectId: projectId },
    orderBy: { createdAt: "asc" },
  });
  res.json(guests);
});

// POST /guests — { projectId?, name, phone?, rsvpStatus? }
const createGuestSchema = z.object({
  projectId: z.string().optional(),
  name: z.string().min(1).max(120),
  phone: z.string().max(30).optional().nullable(),
  rsvpStatus: rsvpEnum.optional(),
});
export const createGuest = asyncHandler(async (req, res) => {
  const data = createGuestSchema.parse(req.body);
  const projectId = await resolveProject(req.account.id, data.projectId);
  const guest = await prisma.guest.create({
    data: {
      weddingProjectId: projectId,
      name: data.name,
      phone: data.phone ?? null,
      rsvpStatus: data.rsvpStatus ?? "MENUNGGU",
    },
  });
  res.status(201).json(guest);
});

// PATCH /guests/:id — { name?, phone?, rsvpStatus? }
const updateGuestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(30).optional().nullable(),
  rsvpStatus: rsvpEnum.optional(),
});
export const updateGuest = asyncHandler(async (req, res) => {
  const data = updateGuestSchema.parse(req.body);
  await loadGuestForUser(req.params.id, req.account.id);
  const guest = await prisma.guest.update({
    where: { id: req.params.id },
    data,
  });
  res.json(guest);
});

// DELETE /guests/:id
export const deleteGuest = asyncHandler(async (req, res) => {
  await loadGuestForUser(req.params.id, req.account.id);
  await prisma.guest.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

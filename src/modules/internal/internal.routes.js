import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

export const internalRouter = Router();

// GET /internal/ai/vendors — sanitized vendor list for dataset generation
internalRouter.get("/ai/vendors", async (req, res) => {
  const vendors = await prisma.vendor.findMany({
    select: {
      businessName: true,
      category: true,
      region: true,
      priceMin: true,
      priceMax: true,
      ratingAvg: true,
    },
    take: 200,
  });
  res.json(vendors);
});

// GET /internal/ai/packages — vendor services as "packages"
internalRouter.get("/ai/packages", async (req, res) => {
  const services = await prisma.vendorService.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      price: true,
      vendor: { select: { businessName: true, category: true, region: true } },
    },
    take: 200,
  });
  res.json(services);
});

// GET /internal/ai/categories — all available categories
internalRouter.get("/ai/categories", (req, res) => {
  res.json([
    { id: "MUA", label: "Makeup Artist" },
    { id: "CATERING", label: "Katering" },
    { id: "DECORATION", label: "Dekorasi" },
    { id: "PHOTOGRAPHY", label: "Fotografi & Videografi" },
    { id: "ATTIRE", label: "Sewa Busana Pengantin" },
    { id: "WEDDING_ORGANIZER", label: "Wedding Organizer" },
    { id: "VENUE", label: "Venue" },
    { id: "OTHER", label: "Jasa Lainnya" },
  ]);
});

// GET /internal/ai/themes — wedding themes
internalRouter.get("/ai/themes", (req, res) => {
  res.json([
    { id: "garden", label: "Garden Party" },
    { id: "modern", label: "Modern Minimalis" },
    { id: "tradisional", label: "Tradisional / Adat" },
    { id: "rustic", label: "Rustic" },
    { id: "mewah", label: "Mewah / Luxury" },
    { id: "outdoor", label: "Outdoor" },
    { id: "indoor", label: "Indoor / Ballroom" },
  ]);
});

// GET /internal/ai/services — categories as services
internalRouter.get("/ai/services", (req, res) => {
  res.json([
    "MUA", "CATERING", "DECORATION", "PHOTOGRAPHY",
    "ATTIRE", "WEDDING_ORGANIZER", "VENUE", "OTHER",
  ]);
});

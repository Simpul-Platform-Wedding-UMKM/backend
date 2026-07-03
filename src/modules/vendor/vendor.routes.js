import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import {
  searchVendors,
  getVendor,
  updateMyVendorProfile,
  addMyVendorService,
} from "./vendor.controller.js";

export const vendorRouter = Router();

vendorRouter.get("/", searchVendors); // public — hyper-local search
vendorRouter.get("/:id", getVendor); // public — vendor profile page

vendorRouter.patch("/me", requireAuth, requireRole("VENDOR"), updateMyVendorProfile);
vendorRouter.post("/me/services", requireAuth, requireRole("VENDOR"), addMyVendorService);

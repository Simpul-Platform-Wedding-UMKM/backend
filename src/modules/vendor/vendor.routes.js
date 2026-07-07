import { Router } from "express";
import { requireAuth, requireVendor } from "../../middleware/auth.js";
import {
  searchVendors,
  getVendor,
  applyVendor,
  updateMyVendorProfile,
  addMyVendorService,
} from "./vendor.controller.js";

export const vendorRouter = Router();

vendorRouter.get("/", searchVendors); // public — hyper-local search
vendorRouter.get("/:id", getVendor); // public — vendor profile page

vendorRouter.post("/apply", requireAuth, applyVendor);
vendorRouter.patch("/me", requireAuth, requireVendor, updateMyVendorProfile);
vendorRouter.post("/me/services", requireAuth, requireVendor, addMyVendorService);

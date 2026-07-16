import { Router } from "express";
import { requireAuth, requireVendor } from "../../middleware/auth.js";
import {
  searchVendors,
  getVendor,
  applyVendor,
  updateMyVendorProfile,
  addMyVendorService,
  submitKyb,
  getKybStatus,
  setPremiumSeo,
  setAdSlot,
} from "./vendor.controller.js";

export const vendorRouter = Router();

vendorRouter.get("/", searchVendors); // public — hyper-local search
vendorRouter.get("/:id", getVendor); // public — vendor profile page

vendorRouter.post("/apply", requireAuth, applyVendor);
vendorRouter.patch("/me", requireAuth, requireVendor, updateMyVendorProfile);
vendorRouter.post("/me/services", requireAuth, requireVendor, addMyVendorService);

// Gap C: KYB
vendorRouter.post("/me/verify", requireAuth, requireVendor, submitKyb);
vendorRouter.get("/me/verification", requireAuth, requireVendor, getKybStatus);

// Gap F: Premium
vendorRouter.put("/me/premium/seo", requireAuth, requireVendor, setPremiumSeo);
vendorRouter.put("/me/premium/ad-slot", requireAuth, requireVendor, setAdSlot);

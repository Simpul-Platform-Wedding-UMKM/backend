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
  updateMyVendorService,
  deleteMyVendorService,
  getVendorDashboard,
  getVendorEarnings,
  getVendorNotifications,
  getVendorCatalog,
  addVendorPortfolio,
  getVendorPremium,
} from "./vendor.controller.js";

export const vendorRouter = Router();

vendorRouter.get("/", searchVendors); // public — hyper-local search
vendorRouter.get("/:id", getVendor); // public — vendor profile page

vendorRouter.post("/apply", requireAuth, applyVendor);
vendorRouter.patch("/me", requireAuth, requireVendor, updateMyVendorProfile);
vendorRouter.post("/me/services", requireAuth, requireVendor, addMyVendorService);

// Vendor management endpoints (all requireAuth + requireVendor)
vendorRouter.patch("/me/services/:serviceId", requireAuth, requireVendor, updateMyVendorService);
vendorRouter.delete("/me/services/:serviceId", requireAuth, requireVendor, deleteMyVendorService);
vendorRouter.get("/me/dashboard", requireAuth, requireVendor, getVendorDashboard);
vendorRouter.get("/me/earnings", requireAuth, requireVendor, getVendorEarnings);
vendorRouter.get("/me/notifications", requireAuth, requireVendor, getVendorNotifications);
vendorRouter.get("/me/catalog", requireAuth, requireVendor, getVendorCatalog);
vendorRouter.post("/me/portfolio", requireAuth, requireVendor, addVendorPortfolio);
vendorRouter.get("/me/premium", requireAuth, requireVendor, getVendorPremium);

// Gap C: KYB
vendorRouter.post("/me/verify", requireAuth, requireVendor, submitKyb);
vendorRouter.get("/me/verification", requireAuth, requireVendor, getKybStatus);

// Gap F: Premium
vendorRouter.put("/me/premium/seo", requireAuth, requireVendor, setPremiumSeo);
vendorRouter.put("/me/premium/ad-slot", requireAuth, requireVendor, setAdSlot);

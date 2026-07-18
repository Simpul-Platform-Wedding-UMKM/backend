import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import {
  addCartItem,
  listCartItems,
  removeCartItem,
  clearCart,
} from "./cart-item.controller.js";

export const cartRouter = Router();

cartRouter.use(requireAuth, requireRole("CONSUMER"));
cartRouter.post("/", addCartItem);
cartRouter.get("/", listCartItems);
cartRouter.delete("/", clearCart);
cartRouter.delete("/:vendorServiceId", removeCartItem);

import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import {
  addBookmark,
  listBookmarks,
  checkBookmark,
  removeBookmark,
} from "./bookmark.controller.js";

export const bookmarkRouter = Router();

bookmarkRouter.use(requireAuth, requireRole("CONSUMER"));
bookmarkRouter.post("/", addBookmark);
bookmarkRouter.get("/", listBookmarks);
bookmarkRouter.get("/:vendorId", checkBookmark);
bookmarkRouter.delete("/:vendorId", removeBookmark);

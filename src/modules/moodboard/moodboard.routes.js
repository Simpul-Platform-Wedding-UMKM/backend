import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import {
  listMoodboardItems,
  createMoodboardItem,
  deleteMoodboardItem,
} from "./moodboard.controller.js";

export const moodboardRouter = Router();

moodboardRouter.use(requireAuth);
moodboardRouter.get("/", listMoodboardItems);
moodboardRouter.post("/", createMoodboardItem);
moodboardRouter.delete("/:id", deleteMoodboardItem);

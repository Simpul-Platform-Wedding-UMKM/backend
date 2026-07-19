import { Router } from "express";
import { listLocations } from "./location.controller.js";

export const locationRouter = Router();

locationRouter.get("/", listLocations);

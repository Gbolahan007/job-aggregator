import { Router } from "express";
import * as jobsController from "../controllers/jobsController.js";

const router = Router();

router.route("/").get(jobsController.getAllJobs);
router.route("/:id").get(jobsController.getJob);

export default router;

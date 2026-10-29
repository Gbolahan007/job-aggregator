import { Router } from "express";
import * as jobsController from "../controllers/jobsController.js";

const router = Router();

router.route("/").get(jobsController.getAllJobs);

export default router;

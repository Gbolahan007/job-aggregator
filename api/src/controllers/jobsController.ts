import type { NextFunction, Request, Response } from "express";
import * as jobsModel from "../models/jobsModel.js";
import { AppError } from "../utils/appError.js";

export async function getAllJobs(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const feedWindow = req.query.window ?? jobsModel.DEFAULT_WINDOW;

  if (!jobsModel.isFeedWindow(feedWindow)) {
    const allowed = Object.keys(jobsModel.FEED_WINDOWS).join(", ");
    return next(new AppError(`Invalid window. Use one of: ${allowed}`, 400));
  }

  const rawSearch = req.query.q;

  if (rawSearch !== undefined && typeof rawSearch !== "string") {
    return next(new AppError("Search must be a single value.", 400));
  }

  const search = rawSearch?.trim() || undefined;

  if (search && search.length > jobsModel.MAX_SEARCH_LENGTH) {
    return next(
      new AppError(
        `Search must be at most ${jobsModel.MAX_SEARCH_LENGTH} characters.`,
        400,
      ),
    );
  }

  const jobs = await jobsModel.getFeed(feedWindow, search);

  res.status(200).json({
    status: "success",
    window: feedWindow,
    search: search ?? null,
    results: jobs.length,
    data: { jobs },
  });
}

export async function getJob(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params;

  console.log(id);
  console.log(`getJob`);
  if (!jobsModel.isJobId(id)) {
    return next(
      new AppError("Invalid job id. It must be a positive whole number.", 400),
    );
  }

  const job = await jobsModel.getJob(id);

  if (!job) {
    return next(new AppError("No job found with that ID", 404));
  }

  res.status(200).json({
    status: "success",
    data: { job },
  });
}

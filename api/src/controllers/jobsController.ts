import type { NextFunction, Request, Response } from "express";
import * as jobsModel from "../models/jobsModel.js";
import { AppError } from "../utils/appError.js";

function readQueryParam(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new AppError(`${name} must be a single value.`, 400);
  }
  const text = value.trim();
  if (text.length > jobsModel.MAX_SEARCH_LENGTH) {
    throw new AppError(
      `${name} must be at most ${jobsModel.MAX_SEARCH_LENGTH} characters.`,
      400,
    );
  }
  return text || undefined;
}

function requireOneOf(
  value: string | undefined,
  allowed: readonly string[],
  name: string,
) {
  if (value !== undefined && !allowed.includes(value)) {
    throw new AppError(
      `Invalid ${name}. Use one of: ${allowed.join(", ")}`,
      400,
    );
  }
}
function readPositiveInt(
  value: unknown,
  name: string,
  fallback: number,
  max: number,
): number {
  const text = readQueryParam(value, name);
  if (text === undefined) return fallback;
  if (!/^\d+$/.test(text)) {
    throw new AppError(`${name} must be a whole number.`, 400);
  }
  const number = Number(text);
  if (number < 1 || number > max) {
    throw new AppError(`${name} must be between 1 and ${max}.`, 400);
  }
  return number;
}

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

  const search = readQueryParam(req.query.q, "Search");
  const location = readQueryParam(req.query.location, "location");
  const workArrangement = readQueryParam(
    req.query.work_arrangement,
    "work_arrangement",
  );
  const employmentType = readQueryParam(
    req.query.employment_type,
    "employment_type",
  );
  const source = readQueryParam(req.query.source, "source");

  requireOneOf(
    workArrangement,
    jobsModel.WORK_ARRANGEMENTS,
    "work_arrangement",
  );
  requireOneOf(employmentType, jobsModel.EMPLOYMENT_TYPES, "employment_type");

  if (source && !jobsModel.SOURCE_SLUG_PATTERN.test(source)) {
    throw new AppError(
      "Invalid source. Use a source slug such as remote-ok.",
      400,
    );
  }

  const page = readPositiveInt(req.query.page, "page", 1, jobsModel.MAX_PAGE);
  const limit = readPositiveInt(
    req.query.limit,
    "limit",
    jobsModel.DEFAULT_LIMIT,
    jobsModel.MAX_LIMIT,
  );
  const sort = readQueryParam(req.query.sort, "sort") ?? jobsModel.DEFAULT_SORT;

  if (!jobsModel.isFeedSort(sort)) {
    throw new AppError(
      `Invalid sort. Use one of: ${jobsModel.SORT_OPTIONS.join(", ")}`,
      400,
    );
  }

  const filters = { search, location, workArrangement, employmentType, source };
  const { jobs, total, totalPages } = await jobsModel.getFeed(
    feedWindow,
    filters,
    { page, limit, sort },
  );

  res.status(200).json({
    status: "success",
    window: feedWindow,
    filters,
    sort,
    results: jobs.length,
    pagination: { page, limit, total, totalPages },
    data: { jobs },
  });
}

export async function getJob(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params;

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

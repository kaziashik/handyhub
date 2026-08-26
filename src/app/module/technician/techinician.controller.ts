import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";

import { TechinicianService } from "./techinician.service";
import { ApplyAsTechnicianValidationZodSchema } from "./techinician.validation";

const applyAsTechinician = catchAsync(async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  
  console.log({ files });

  const resume =files?.["resume"]?.[0] ?? null;

  const additionalFiles = files?.["additionalFiles"] || [];

  const zodValidationResult = ApplyAsTechnicianValidationZodSchema.safeParse(
    JSON.parse(req.body.data),
  );

  if (!zodValidationResult.success) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      zodValidationResult.error.issues[0]?.message || "Validation failed",
    );
  }

  const payload = zodValidationResult.data;

  const result = await TechinicianService.applyAsTechinician(
    payload,
    resume,
    additionalFiles,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Applied As Techinician Successfuly",
    data: result,
  });
});

export const TechinicianController = {
  applyAsTechinician,
  // verifyDoctorEmail,
  // approveDoctor,
  // getAllDoctors
};

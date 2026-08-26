import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status";
import { resolve } from "node:dns";
import { rejects } from "node:assert";
import { cloudinary } from "../../lib/cloudinary";
import { error } from "node:console";
import { promise } from "zod";

import bcrypt from "bcryptjs";
import crypto from "crypto";

import config from "../../config";
import { Role, TechinicianVerificationStatus } from "../../../generated/prisma/enums";
import { redisClient } from "../../lib/redits";
import path from "path";
import ejs from "ejs";
import { transporter } from "../../lib/nodemailer";
import {
  IApplyAsTechnicianPayload,
  IApproveTechinicianPayload,
  IVerifyTechinicianEmailPayload,
} from "./techinician.interface";
import { RequestUser } from "../../middleware/checkAuth";

const applyAsTechinician = async (
  payload: IApplyAsTechnicianPayload,
  resume: Express.Multer.File | null,
  additionalFiles: Express.Multer.File[],
) => {
  const isUserExists = await prisma.user.findUnique({
    where: {
      email: payload.user.email,
    },
  });

  if (isUserExists) {
    throw new AppError(
      httpStatus.CONFLICT,
      "User Already Exists With This Email",
    );
  }

  const resumeUploadResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "auto",
          },

          async (error, result) => {
            if (error) {
              return reject(error);
            }

            if (!result) {
              return reject(
                new AppError(
                  httpStatus.INTERNAL_SERVER_ERROR,
                  "No result returned from Cloudinary",
                ),
              );
            }

            resolve(result);
          },
        )
        .end(resume?.buffer);
    },
  );

  console.log({ resumeUploadResult });

  const additionalFilesUploadResults = await Promise.all(
    additionalFiles.map((file) => {
      return new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              resource_type: "auto",
            },

            async (error, result) => {
              if (error) {
                return reject(error);
              }

              if (!result) {
                return reject(new Error("No result returned from Cloudinary"));
              }

              resolve(result);
            },
          )
          .end(file.buffer);
      });
    }),
  );

  console.log({ additionalFilesUploadResults });

  const randomTechinicianPassword = Math.random().toString(36).slice(-8);

  const hashedPassword = await bcrypt.hash(
    randomTechinicianPassword,
    Number(config.bcrypt_salt_rounds),
  );

  const techinicianApplication = await prisma.user.create({
    data: {
      ...payload.user,
      password: hashedPassword,
      role: Role.TECHNICIAN,
      needPasswordChange: true,
      techinician: {
        create: {
          name: payload.user.name,
          email: payload.user.email,
          ...payload.technician,
          resume: resumeUploadResult.secure_url,
          resumePublicId: resumeUploadResult.public_id,
          additionalFiles: additionalFilesUploadResults.map((file) => ({
            url: file.secure_url,
            publicId: file.public_id,
          })),
        },
      },
    },

    include: {
      techinician: true,
    },
  });

  const expirationSeconds = 60 * 60;

  const otpKey = `techinicia-application-otp:${payload.user.email}`;
  const otpValue = crypto.randomInt(100000, 1000000).toString();

  await redisClient.set(otpKey, otpValue, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  const tempatePath = path.join(
    process.cwd(),
    "src/app/module/templates/registration-user-otp.ejs",
  );

  const templateData = {
    name: payload.user.name,
    email: payload.user.email,
    otpValue: otpValue,
    expirationMinutes: expirationSeconds / 60,
  };

  const html = await ejs.renderFile(tempatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: payload.user.email,
    subject: "Techinicia Application - Email Verification",
    html,
  });

  return techinicianApplication;
};

const verifyTechinicianEmail = async (
  payload: IVerifyTechinicianEmailPayload,
) => {
  const otp = payload.otp;
  const email = payload.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
      role: Role.TECHNICIAN,
    },
  });

  if (!existingUser) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Technician Application Not Found. Please Apply Again.",
    );
  }

  if (existingUser.emailVerified) {
    throw new AppError(httpStatus.CONFLICT, "Email Already Verified");
  }

  const otpKey = `techinicia-application-otp:${payload.email}`;

  const redisOtp = await redisClient.get(otpKey);

  if (!redisOtp) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "OTP Expired. Your Application Window Has Closed, Please Apply Again.",
    );
  }

  if (redisOtp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP Does Not Match");
  }

  await redisClient.del(otpKey);

  const verifieUser = await prisma.user.update({
    where: { id: existingUser.id },
    data: { emailVerified: true },
    omit: { password: true },
    include: { techinician: true },
  });
  return verifieUser;
};

const approveTechinician= async(payload: IApproveTechinicianPayload, reviewer: RequestUser)=>{

	const {  techinicianId, verificationStatus, rejectionReason } = payload;

	
	const existingTechinician = await prisma.techinician.findUnique({
		where: { id: techinicianId },
		include: { user: true },
	});
	if (!existingTechinician) {
		throw new AppError(httpStatus.NOT_FOUND, "Techinician Application Not Found");
	}

	if (existingTechinician.isDeleted) {
		throw new AppError(httpStatus.GONE, "Technician Application Has Been Deleted");
	}

	if (!existingTechinician.user.emailVerified) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Techinician Has Not Verified Their Email Yet. Application Cannot Be Reviewed.",
		);
	}

	if (existingTechinician.verificationStatus !==  TechinicianVerificationStatus.PENDING) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Techinician Application Has Already Been ${existingTechinician.verificationStatus.toLowerCase()}`,
		);
	}

	if (
		verificationStatus === TechinicianVerificationStatus.REJECTED &&
		!rejectionReason
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Rejection Reason Is Required When Rejecting A Techinician Application",
		);
	}

	const updateTechinician=await prisma.techinician.update({
		where:{id:techinicianId},
		data:{
			verificationStatus,
			rejectionReason:verificationStatus=== TechinicianVerificationStatus.REJECTED ? rejectionReason :null,
			reviewedBy : reviewer.userId,
			reviewedAt: new Date(),
		}
	});

	const isApproved=verificationStatus === TechinicianVerificationStatus.APPROVED;
	const tempatePath = path.join(
		process.cwd(),
		`src/app/module/templates/${isApproved
			? "techinician-application-approved.ejs"
			: "techinician-application-rejected.ejs"
		}`,
	)

	const templateData = {
		name: updateTechinician.name,
		reason: updateTechinician.rejectionReason,
	};

	const html = await ejs.renderFile(tempatePath, templateData);

	await transporter.sendMail({
		from: config.email_sender,
		to: updateTechinician.email,
		subject: isApproved
			? "Your Techinician Application Has Been Approved"
			: "Your Techinician Application Has Been Rejected",
		html,
	});

	return updateTechinician


}

export const TechinicianService = {
  applyAsTechinician,
 verifyTechinicianEmail,
  approveTechinician,
  // getAllDoctors
};

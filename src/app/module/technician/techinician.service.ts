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
import { Role } from "../../../generated/prisma/enums";
import { redisClient } from "../../lib/redits";
import path from "path";
import ejs from "ejs";
import { transporter } from "../../lib/nodemailer";
import { IApplyAsTechnicianPayload } from "./techinician.interface";

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


    console.log({resumeUploadResult});

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

    
	const expirationSeconds = 60 * 60 

	const otpKey = `techinicia-application-otp:${payload.user.email}`
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
		email : payload.user.email,
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


export const TechinicianService = {
	applyAsTechinician ,
	// verifyDoctorEmail,
	// approveDoctor,
	// getAllDoctors
};

import bcrypt from "bcryptjs";
import { Role, AuthProvider, TechnicianStatus, TechinicianVerificationStatus } from "../../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import config from "../config";
import { AppError } from "./AppError";
import httpStatus from "http-status";

export const seedSuperAdmin = async () => {
  try {
    const isSuperAdminExist = await prisma.user.findFirst({
      where: { role: Role.ADMIN },
    });

    if (isSuperAdminExist) {
      console.log("Admin already exists!");
      return;
    }

    const {
      super_admin_name: name,
      super_admin_email: email,
      super_admin_password: password,
    } = config;

    if (!name || !email || !password) {
      throw new Error(
        "Super admin name, email, or password missing in env file!",
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(password, config.bcrypt_salt_rounds);

    const superAdmin = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        role: Role.ADMIN,
        isVerified: true,
        auths: {
          create: {
            provider: AuthProvider.CREDENTIALS,
            providerId: normalizedEmail,
            password: hashedPassword,
          },
        },
      },
      include: { auths: { omit: { password: true } } },
    });

    console.log("Super admin created:", superAdmin);
  } catch (error) {
    console.log("Error seeding super admin:", error);

    await prisma.user.deleteMany({
      where: { email: config.super_admin_email?.trim().toLowerCase() },
    }).catch(() => {});
  }
};




// / create tester Techinican 

export const seedTesterTechinican = async () => {
	try {
		const isTesterTechinicanExist = await prisma.user.findUnique({
			where: {
				email: config.tester_techinican_email,
			},
		});

		if (isTesterTechinicanExist) {
			console.log("Tester Techinican Already Exists!");
			return;
		}

		const name = config.tester_techinican_name;
		const email = config.tester_techinican_email;
		const password = config.tester_techinican_password;

		if (!name || !email || !password) {
			throw new AppError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Tester Techinican Name , Email, Password Missing In Env File!!!",
			);
		}

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const testerTechinican = await prisma.user.create({
			data: {
				name,
				email,
				role: Role.TECHNICIAN,
				needPasswordChange: false,
				emailVerified: true,
				auths: {
					create: {
						provider: AuthProvider.CREDENTIALS,
						providerId: email,
						password: hashedPassword,
					},
				},
				techinician: {
					create: {
						email,
						name,
						experienceYears: 5,
						licenseNumber: "BMDC0000",
						qualifications: "MBBS",
						specialization: "Neurology",
						verificationStatus: TechinicianVerificationStatus.APPROVED,
					},
				},
			},
			include: { auths: { omit: { password: true } } },
		});

		console.log("Tester Techinican  Created : ", testerTechinican);
	} catch (error) {
		console.log("Error Seeding Tester Techinican  : ", error);

		await prisma.user.delete({
			where: {
				email: config.tester_techinican_email,
			},
		});
	}
};


import crypto from "crypto";
import path from "path";
import bcrypt from "bcryptjs";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { ILoginUserPayload, IRegisterUserPayload, IRequestUser, IVerifyEmailPayload } from "./auth.interface";
import { redisClient } from "../../lib/redits";
import { transporter } from "../../lib/nodemailer";
import ejs from "ejs";
import { jwtUtils } from "../../middleware/jwt";
import { JwtPayload, SignOptions } from "jsonwebtoken";
import type { StringValue } from "ms";
import { UserStatus } from "../../../generated/prisma/enums";

const registerUser = async (payload: IRegisterUserPayload) => {
  const { name, password, role, phone } = payload;
  const email = payload.email.trim().toLowerCase();

  const isUserExists = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExists) {
    throw new Error("User with this email already exists");
  }

  const expirationSeconds = 5 * 60;

  const otpKey = `user-registration-otp:${email}`;
  const otpValue = crypto.randomInt(100000, 1000000).toString();

  await redisClient.set(otpKey, otpValue, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  const hashedPassword = await bcrypt.hash(
    password,
    Number(config.bcrypt_salt_rounds),
  );

  const registrationKey = `user-registration-data:${email}`;
  const redisUserDataPayload = {
    name,
    email,
    password: hashedPassword,
    role,
    phone,
  };

  await redisClient.set(
    registrationKey,
    JSON.stringify(redisUserDataPayload),
    {
      expiration: {
        type: "EX",
        value: expirationSeconds,
      },
    },
  );

  const templatePath = path.join(
  process.cwd(),
  "src/app/module/templates/registration-user-otp.ejs",
);
const templateData = {
  name,
  email,
  otpValue,
  expirationMinutes: expirationSeconds / 60,   
};
  const html = await ejs.renderFile(templatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: email,
    subject: "Verify your HandyHub account",
    html,
  });
};

const verifyUserEmail = async (payload: IVerifyEmailPayload) => {
  const otp = payload.otp;
  const email = payload.email.trim().toLowerCase();

  const isUserExist = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExist?.status === "BANNED") {
    throw new Error("User is blocked");
  }

  if (isUserExist?.isVerified) {
    throw new Error("Email already verified");
  }

  if (isUserExist?.status === "DELETED") {
    throw new Error("User account no longer exists");
  }

  const otpKey = `user-registration-otp:${email}`;
  const redisOtp = await redisClient.get(otpKey);

  if (!redisOtp) {
    throw new Error("OTP expired or invalid, please register again");
  }

  if (redisOtp !== otp) {
    throw new Error("OTP does not match");
  }

  await redisClient.del(otpKey);

  const registrationKey = `user-registration-data:${email}`;
  const redisUserData = await redisClient.get(registrationKey);

  if (!redisUserData) {
    throw new Error("Registration data not found, please register again");
  }

  const userPayload: IRegisterUserPayload = JSON.parse(redisUserData);

  const createdUser = await prisma.user.create({
    data: {
      name: userPayload.name,
      email: userPayload.email,
      password: userPayload.password,
      role: userPayload.role,
      status: "ACTIVE",
      isVerified: true,
      phone: userPayload.phone,
      ...(userPayload.role === "TECHNICIAN" && {
        technicianProfile: {
          create: {},
        },
      }),
    },
    omit: { password: true },
    include: { technicianProfile: true },
  });

  await redisClient.del(registrationKey);

 const templatePath = path.join(
  process.cwd(),
  "src/app/module/templates/customar-welcome-email.ejs",
);

  const templateData = {
    name: createdUser.name,
    role: createdUser.role,
  };

  const html = await ejs.renderFile(templatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: email,
    subject: "Welcome to HandyHub",
    html,
  });

  const { technicianProfile, ...user } = createdUser;
  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };



const accessToken = jwtUtils.createToken(
  jwtPayload,
  config.jwt_access_secret,
  config.jwt_access_expires_in as StringValue,
);

const refreshToken = jwtUtils.createToken(
  jwtPayload,
  config.jwt_refresh_secret,
  config.jwt_refresh_expires_in as StringValue,
);

  return {
    user,
    technicianProfile,
    accessToken,
    refreshToken,
  };
};



const loginUser = async (payload: ILoginUserPayload) => {
  const { password } = payload;
  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.status === UserStatus.BANNED) {
    throw new Error("User is blocked");
  }

if (user.status === UserStatus.DELETED) {
  throw new Error("User is deleted");
}

  if (user.password === null && user.googleId !== null) {
    throw new Error(
      "User Alredy Registered With Google Login. Please Use Google Login",
    );
  }

  const isPasswordMatched = await bcrypt.compare(
    password,
    user.password as string,
  );

  if (!isPasswordMatched) {
    throw new Error("Invalid credentials");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as StringValue,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as StringValue,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const getMe = async (user: IRequestUser) => {
  const isUserExists = await prisma.user.findUnique({
    where: {
      id: user.userId,
    },
    include: {
      technicianProfile: true,
    },
    omit: {
      password: true,
    },
  });

  if (!isUserExists) {
    throw new Error("User not found");
  }

  return isUserExists;
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
		throw new Error(
			config.NODE_ENV === "development"
				? verifiedRefreshToken.error
				: "Invalid refresh token",
		);
	}

	const data = verifiedRefreshToken.data as JwtPayload;

	const user = await prisma.user.findUnique({
		where: { id: data.userId },
	});

	if (!user || user.status === UserStatus.DELETED || user.status !== UserStatus.ACTIVE) {
		throw new Error("User is inactive or not found");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as StringValue,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as StringValue,
	);

	return {
		accessToken,
		refreshToken,
	};
};

export const AuthService = {
  registerUser,
  verifyUserEmail,
  loginUser,
  getMe,
  refreshToken,
//   googleLogin,
//   forgotPassword,
//   restPassword,
};

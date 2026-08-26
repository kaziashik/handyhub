
import crypto from "crypto";
import bcryptjs from "bcryptjs";
import path from "path";
import bcrypt from "bcryptjs";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { IForgotPasswordPayload, IGoogleLoginPayload, ILoginUserPayload, IRegisterUserPayload, IRequestUser, IResetPasswordPayload, IVerifyEmailPayload } from "./auth.interface";
import { redisClient } from "../../lib/redits";
import { transporter } from "../../lib/nodemailer";
import ejs from "ejs";
import { jwtUtils } from "../../middleware/jwt";
import { JwtPayload, SignOptions } from "jsonwebtoken";
import type { StringValue } from "ms";
import { AuthProvider, UserStatus } from "../../../generated/prisma/enums";
import { TokenPayload } from "google-auth-library";
import { googleClient } from "../../lib/googleAuth";

const registerUser = async (payload: IRegisterUserPayload) => {
  const { name, password, role, phone } = payload;
  const email = payload.email.trim().toLowerCase();

  const isUserExists = await prisma.user.findUnique({ where: { email } });

  if (isUserExists) {
    throw new Error("User with this email already exists");
  }

  const expirationSeconds = 5 * 60;

  const otpKey = `user-registration-otp:${email}`;
  const otpValue = crypto.randomInt(100000, 1000000).toString();

  await redisClient.set(otpKey, otpValue, {
    expiration: { type: "EX", value: expirationSeconds },
  });

  const hashedPassword = await bcryptjs.hash(password, config.bcrypt_salt_rounds);

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
    { expiration: { type: "EX", value: expirationSeconds } },
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

export const AuthServices = { registerUser };

const verifyUserEmail = async (payload: IVerifyEmailPayload) => {
  const otp = payload.otp;
  const email = payload.email.trim().toLowerCase();

  const isUserExist = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExist?.status === "BANNED") {
    throw new Error("User is blocked");
  }

  if (isUserExist?.emailVerified) {
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
      role: userPayload.role,
      status: "ACTIVE",
      emailVerified: true,
      phone: userPayload.phone,
      auths: {
        create: {
          provider: "CREDENTIALS",
          providerId: userPayload.email,
          password: userPayload.password,
        },
      },
      ...(userPayload.role === "TECHNICIAN" && {
        technicianProfile: {
          create: {},
        },
      }),
    },
    include: {
      technicianProfile: true,
      auths: { omit: { password: true } },
    },
  });

  await redisClient.del(registrationKey);

  const templatePath = path.join(
    process.cwd(),
    "src/app/module/templates/customer-welcome-email.ejs",
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

  const { technicianProfile, auths, ...user } = createdUser;
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
    include: { auths: true },
  });

  if (!user) {
    throw new Error("Invalid credentials");
  }

  if (user.status === UserStatus.BANNED) {
    throw new Error("User is blocked");
  }

  if (user.status === UserStatus.DELETED) {
    throw new Error("User is deleted");
  }

  const credentialsAuth = user.auths.find(
    (auth) => auth.provider === "CREDENTIALS",
  );

  if (!credentialsAuth || !credentialsAuth.password) {
    throw new Error(
      "This account uses Google login. Please sign in with Google instead.",
    );
  }

  const isPasswordMatched = await bcrypt.compare(
    password,
    credentialsAuth.password,
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
    where: { id: user.userId },
    include: {
      technicianProfile: true,
      auths: {
        omit: { password: true },
      },
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
      config.node_env === "development"
        ? verifiedRefreshToken.error
        : "Invalid refresh token",
    );
  }

  const data = verifiedRefreshToken.data as JwtPayload;

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
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

  const newRefreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as StringValue,
  );

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
};


const forgotPassword = async (payload: IForgotPasswordPayload) => {
  const { email } = payload;

  const isUserExist = await prisma.user.findUnique({
    where: { email },
    include: { auths: true },
  });

  if (!isUserExist) {
    throw new Error("User does not exist!");
  }

  if (isUserExist.status === "BANNED") {
    throw new Error("User is blocked");
  }

  if (!isUserExist.emailVerified) {
    throw new Error("User not verified");
  }

  if (isUserExist.status === "DELETED") {
    throw new Error("User is deleted");
  }

  const credentialsAuth = isUserExist.auths.find(
    (auth) => auth.provider === "CREDENTIALS",
  );

  if (!credentialsAuth) {
    throw new Error("This account uses Google sign-in and has no password to reset");
  }

  const otp = crypto.randomInt(100000, 1000000).toString();

  const key = `forgot-password-otp:${email}`;

  const expirationSeconds = 5 * 60;

  await redisClient.set(key, otp, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  const templatePath = path.join(
    process.cwd(),
    "src/app/module/templates/forgot-password.ejs",
  );

  const templateData = {
    name: isUserExist.name,
    otp,
    expirationMinutes: expirationSeconds / 60,
  };

  const html = await ejs.renderFile(templatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: email,
    subject: "Forgot Password",
    html,
  });
};

const resetPassword = async (payload : IResetPasswordPayload) => {
	const { email, otp, newPassword } = payload;

	const isUserExist = await prisma.user.findUnique({
		where: {
			email
		},
     include: { auths: true },
	});

	if (!isUserExist) {
		throw new Error("User Does Not Exist!")
	};

	if (isUserExist.status === "BANNED") {
		throw new Error("User is Blocked")
	}

	if (!isUserExist.emailVerified) {
		throw new Error("User Not Verified")
	}

	if (isUserExist.status === "DELETED") {
		throw new Error("User is Deleted")
	}

  const credentialsAuth = isUserExist.auths.find(
    (auth) => auth.provider === "CREDENTIALS",
  );

  if (!credentialsAuth) {
    throw new Error("This account uses Google sign-in and has no password to reset");
  }

	const key = `forgot-password-otp:${email}`

	const redisOtp = await redisClient.get(key)
  console.log("check OTP",redisOtp);

	if(!redisOtp){
		throw new Error("Invalid OTP")
	}

	if(redisOtp !== otp){
		throw new Error("OTP Does Not Match")
	}

	const hashedNewPassword = await bcrypt.hash(newPassword, Number(config.bcrypt_salt_rounds));

	  await prisma.auth.update({
    where: {
      provider_providerId: {
        provider: "CREDENTIALS",
        providerId: email,
      },
    },
    data: {
      password: hashedNewPassword,
    },
  });

	await redisClient.del([key]);

	const tempatePath = path.join(process.cwd(), "src/app/module/templates/reset-password-success.ejs")

	const templateData = {
		name: isUserExist.name
	}

	const html = await ejs.renderFile(tempatePath, templateData )


	await transporter.sendMail({
		from: config.email_sender,
		to: isUserExist.email,
		subject: "Password Changed",
		// text : `Your OTP is ${otp}`
		// html: `<h1>Your Password Is Changed</h1>`
		html
	})
}

const googleLogin = async (payload: IGoogleLoginPayload) => {
  let googleIdTokenPayload: TokenPayload| null | undefined = null;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: config.GOOGLE_CLIENT_ID,
    });

    googleIdTokenPayload = ticket.getPayload();
  } catch (error) {
    console.log("Google ID token verification failed", error);
    throw new Error("Invalid or expired Google ID token");
  }

  if (!googleIdTokenPayload) {
    throw new Error("Invalid or expired Google ID token");
  }

  if (!googleIdTokenPayload.email) {
    throw new Error("Google email not found");
  }

  if (!googleIdTokenPayload.name) {
    throw new Error("Google user name not found");
  }

  const email = googleIdTokenPayload.email.trim().toLowerCase();

  let user = await prisma.user.findUnique({
    where: { email },
    include: { auths: true },
  });

  if (user) {
    if (user.status === "BANNED") {
      throw new Error("User is blocked");
    }

    if (user.status === "DELETED") {
      throw new Error("User account no longer exists");
    }

    const googleAuth = user.auths.find((auth) => auth.provider === "GOOGLE");

    if (!googleAuth) {
      // existing CREDENTIALS user linking Google for the first time
      await prisma.auth.create({
        data: {
          provider: "GOOGLE",
          providerId: googleIdTokenPayload.sub,
          userId: user.id,
        },
      });
    }
  } else {
    // brand-new user via Google
    user = await prisma.user.create({
      data: {
        name: googleIdTokenPayload.name,
        email,
        role: "CUSTOMER",
        isVerified: true,
        auths: {
          create: {
            provider: "GOOGLE",
            providerId: googleIdTokenPayload.sub,
          },
        },
      },
      include: { auths: true },
    });

    const templatePath = path.join(
      process.cwd(),
      "src/app/module/templates/customer-welcome-email.ejs",
    );

    const templateData = {
      name: user.name,
      role: user.role,
    };

    const html = await ejs.renderFile(templatePath, templateData);

    await transporter.sendMail({
      from: config.email_sender,
      to: user.email,
      subject: "Welcome to HandyHub",
      html,
    });
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

  return { accessToken, refreshToken, user };
};

export const AuthService = {
  registerUser,
  verifyUserEmail,
  loginUser,
  getMe,
  refreshToken,
  googleLogin,
  forgotPassword,
  resetPassword,
};

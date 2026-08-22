import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AuthService } from "./auth.service";
import httpStatus from "http-status";
import config from "../../config";


const registerUse = catchAsync(async (req: Request, res: Response) => {
 // const payload = PatientValidation.PatientRegistrationZodSchema.safeParse(req.body);

	// if(!payload.success){
	// 	console.log(payload.error);
	// 	console.log(payload.error.issues);
		
	// 	throw new Error(payload.error.issues[0].message)
	// }

	// console.log(payload);
  const payload = req.body;
 await AuthService.registerUser(payload);

  // const { accessToken, refreshToken, user, patient } = result;

  // res.cookie("accessToken", accessToken, {
  //   httpOnly: true,
  //   secure: false,
  //   sameSite: "none",
  //   maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
  // });
  // res.cookie("refreshToken", refreshToken, {
  //   httpOnly: true,
  //   secure: false,
  //   sameSite: "none",
  //   maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  // });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Verification OTP Sent",
    data: null
  });
});

const verifyUserEmail = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;

  const result = await AuthService.verifyUserEmail(payload);

  const { accessToken, refreshToken, user, technicianProfile } = result;

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: config.node_env === "production",
    sameSite: config.node_env === "production" ? "none" : "lax",
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: config.node_env === "production",
    sameSite: config.node_env === "production" ? "none" : "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Email verified successfully",
    data: {
      accessToken,
      refreshToken,
      user,
      technicianProfile,
    },
  });
});


export const AuthController = {
  registerUse,
  verifyUserEmail,
//   loginUser,
//   getMe,
//   refreshToken,
//   googleLogin,
//   forgotPassword,
//   restPassword
};

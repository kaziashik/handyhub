import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AuthService } from "./auth.service";
import httpStatus from "http-status";
import config from "../../config";
import { IRequestUser } from "./auth.interface";
import { clearAuthCookie } from "../../halpers/authCookie";


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
    secure: config.NODE_ENV === "production",
    sameSite: config.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: config.NODE_ENV === "production" ? "none" : "lax",
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

const loginUser = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const result = await AuthService.loginUser(payload);
	const { accessToken, refreshToken } = result;

	res.cookie("accessToken", accessToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
	});
	res.cookie("refreshToken", refreshToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
	});

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User logged in successfully",
		data: {
			accessToken,
			refreshToken,
		},
	});
});


const getMe = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as unknown as IRequestUser;

	if (!user) {
		throw new Error("User information is missing in the request");
	}

	const result = await AuthService.getMe(user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User profile fetched successfully",
		data: result,
	});
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
	if (!req.cookies.refreshToken) {
		throw new Error("Refresh token is missing");
	}
	const result = await AuthService.refreshToken(req.cookies.refreshToken);
	const { accessToken, refreshToken: newRefreshToken } = result;

	res.cookie("accessToken", accessToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24, // 24 hour or 1 day
	});
	res.cookie("refreshToken", newRefreshToken, {
		httpOnly: true,
		secure: false,
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
	});

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "New tokens generated successfully",
		data: {
			accessToken,
			refreshToken: newRefreshToken,
		},
	});
});

const logout = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    clearAuthCookie(res);
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "User logout successfully",
      data: null,
    });
  },
);

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	await AuthService.forgotPassword(payload);


	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: `OTP Sent To Email : ${payload.email}`,
		data: null,
	});
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	await AuthService.resetPassword(payload);


	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Password Changed Successfully",
		data: null,
	});
});


export const AuthController = {
  registerUse,
  verifyUserEmail,
  loginUser,
  getMe,
  refreshToken,
  logout ,
//   googleLogin,
  forgotPassword,
  resetPassword
};

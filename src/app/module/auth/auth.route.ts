import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { userValidation } from "./auth.validation";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import passport from "passport";


const router = Router();



router.post(
  "/register",validateRequest(userValidation.RegisterUserZodSchema),
  AuthController.registerUse,
);

router.post("/verify-email",
	validateRequest(userValidation.userEmailVerifyZodSchema),
	 AuthController.verifyUserEmail);


   router.post("/login",
	validateRequest(userValidation.LoginZodSchema),
	 AuthController.loginUser);

   router.get(
	"/me",
	auth(Role.ADMIN, Role.CUSTOMER,Role.TECHNICIAN),
	// validateRequest
	AuthController.getMe,
);

router.post("/refresh-token", AuthController.refreshToken);


router.post("/logout", AuthController.logout);

router.post("/forgot-password",
	validateRequest(userValidation.ForgotPasswordZodSchema),
	 AuthController.forgotPassword);

   router.post("/reset-password",
	validateRequest(userValidation.ResetPasswordZodSchema),
	 AuthController.resetPassword);


//    router.get(
//   "/google",
//   passport.authenticate("google", { scope: ["profile", "email"] }),
// );

router.post("/google", AuthController.googleLogin);              






export const AuthRoutes = router;






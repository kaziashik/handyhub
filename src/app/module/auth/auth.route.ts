import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { userValidation } from "./auth.validation";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";


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







export const AuthRoutes = router;






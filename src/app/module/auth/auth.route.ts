import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { userValidation } from "./auth.validation";


const router = Router();



router.post(
  "/register",validateRequest(userValidation.RegisterUserZodSchema),
  AuthController.registerUse,
);

router.post("/verify-email",
	validateRequest(userValidation.userEmailVerifyZodSchema),
	 AuthController.verifyUserEmail);







export const AuthRoutes = router;






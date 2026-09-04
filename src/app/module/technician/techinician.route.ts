import { Router } from "express";
import { upload } from "../../lib/multer";
import { TechinicianController } from "./techinician.controller";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { uploadLimiter } from "../../middleware/rateLimiter";


const router = Router();

router.post(
	"/apply-as-techinician",
	uploadLimiter,
	// validateRequest(UserValidation.ResetPasswordZodSchema),
	upload.fields([
		{
			name: "resume",
			maxCount: 1,
		},

		{
			name: "additionalFiles",
			maxCount: 10,
		},
	]),
	TechinicianController.applyAsTechinician,
);

router.post(
	"/apply-as-techinician/verify-email",
	TechinicianController.verifyTechinicianEmail,
);

router.post(
	"/approve-techinician",auth(Role.ADMIN),
	TechinicianController.approveTechinician,
);

router.get(
	"/all-techinician",
	auth(Role.ADMIN),
	TechinicianController.getAllTechinician,
);

export const TechinicianRoutes = router;

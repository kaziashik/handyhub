import { Router } from "express";
import { upload } from "../../lib/multer";
import { TechinicianController } from "./techinician.controller";

const router = Router();

router.post(
	"/apply-as-techinician",
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

export const TechinicianRoutes = router;

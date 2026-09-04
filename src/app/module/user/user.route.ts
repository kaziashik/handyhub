import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { UserController } from "./user.controller";
import { uploadLimiter } from "../../middleware/rateLimiter";

const router = Router();

router.patch("/profile-image",
    uploadLimiter,
    auth(Role.CUSTOMER, Role.ADMIN, Role.TECHNICIAN),
    upload.single("profileImage"),
    UserController.uploadProfileImage);

export const UserRoutes = router;

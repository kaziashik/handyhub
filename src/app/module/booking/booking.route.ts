import { Router } from "express";
import { AppointmentController } from "./booking.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.post(
  "/book-appointment",
  auth(Role.CUSTOMER),
  AppointmentController.bookAppointment,
);

router.post(
  "/pay-appointment",
  auth(Role.CUSTOMER),
  AppointmentController.payAppointment,
);

router.post(
  "/cancel-appointment",
  auth(Role.CUSTOMER),
  AppointmentController.cancelAppointment,
);

//book appointment callback url
router.get(
  "/book-appointment/payment/callback",
  AppointmentController.bookAppointmentCallback,
);

export const AppointementRoutes = router;

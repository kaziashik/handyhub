import { Router } from "express";
import { AppointmentController } from "./appointmnet.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { BookAppointmentValidationZodSchema, UpdateAppointmentStatusValidationZodSchema } from "./appointmnet.validation";

const router = Router();

router.post(
	"/book-appointment",
	auth(Role.CUSTOMER),
	validateRequest(BookAppointmentValidationZodSchema),
	AppointmentController.bookAppointment,
);
router.post(
	"/pay-appointment",
	auth(Role.CUSTOMER),
	AppointmentController.payAppointment,
);
router.post(
	"/cancel-appointment",
	auth(Role.CUSTOMER, Role.ADMIN),
	AppointmentController.cancelAppointment,
);

//book appointment callback url
router.get(
	"/book-appointment/payment/callback",
	AppointmentController.bookAppointmentCallback,
);

router.patch(
	"/update-status/:appointmentId",
	auth(Role.TECHNICIAN),
	validateRequest(UpdateAppointmentStatusValidationZodSchema),
	AppointmentController.updateAppointmentStatus,
);

router.get(
	"/my-appointments",
	auth(Role.CUSTOMER),
	AppointmentController.getMyAppointments,
);

router.get(
	"/doctor-appointments",
	auth(Role.CUSTOMER),
	AppointmentController.getDoctorAppointments,
);

router.get(
	"/all-appointments",
	auth(Role.ADMIN),
	AppointmentController.getAllAppointments,
);

router.get(
	"/:appointmentId",
	auth(Role.CUSTOMER, Role.TECHNICIAN, Role.ADMIN),
	AppointmentController.getSingleAppointment,
);


export const AppointementRoutes = router;

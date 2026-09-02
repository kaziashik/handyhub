

import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ScheduleController } from "./schedule.controller";
import {
    CreateScheduleValidationZodSchema,
    UpdateScheduleValidationZodSchema,
} from "./schedule.validation";

const router = Router();

router.post(
    "/create-schedule",
    auth(Role.TECHNICIAN),
    validateRequest(CreateScheduleValidationZodSchema),
    ScheduleController.createSchedule,
);

router.get(
    "/my-schedules",
    auth(Role.TECHNICIAN),
    ScheduleController.getMySchedules,
);




router.get(
    "/all-schedules",
    auth(Role.ADMIN),
    ScheduleController.getAllSchedules,
);

router.get("/todays-schedule", ScheduleController.getTodaysSchedules);

router.patch(
    "/update-schedule/:scheduleId",
    auth(Role.TECHNICIAN),
    validateRequest(UpdateScheduleValidationZodSchema),
    ScheduleController.updateSchedule,
);

router.patch(
    "/publish-schedule/:scheduleId",
    auth(Role.TECHNICIAN),
    ScheduleController.publishSchedule,
);

router.get(
    "/:scheduleId",
    auth(Role.TECHNICIAN, Role.ADMIN),
    ScheduleController.getScheduleById,
);

router.delete(
    "/:scheduleId",
    auth(Role.TECHNICIAN),
    ScheduleController.deleteSchedule,
);

export const ScheduleRoutes = router;
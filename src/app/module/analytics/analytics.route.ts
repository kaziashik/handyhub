import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { AnalyticsController } from "./analytics.controller";

const router = Router();

router.get(
    "/customer-analytics",
    auth(Role.CUSTOMER),
    AnalyticsController.getCustomerAnalytics,
);

router.get(
    "/techician-analytics",
    auth(Role.TECHNICIAN),
    AnalyticsController.getTechicianAnalytics,
);

router.get(
    "/admin-analytics",
    auth(Role.ADMIN),
    AnalyticsController.getAdminAnalytics,
);

export const AnalyticsRoutes = router;

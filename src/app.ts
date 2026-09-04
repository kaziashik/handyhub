import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";


import config from "./app/config";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { UserRoutes } from "./app/module/user/user.route";
import passport from "passport";
import { AppointementRoutes } from "./app/module/booking/appointment.route";
import { TechinicianRoutes } from "./app/module/technician/techinician.route";
import { ScheduleRoutes } from "./app/module/schedule/schedule.route";
import { AnalyticsRoutes } from "./app/module/analytics/analytics.route";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { generalLimiter } from "./app/middleware/rateLimiter";


const app: Application = express();

app.use(
  cors({
    origin: config.app_url,
    credentials: true,
  })
);

app.use(passport.initialize());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting - apply globally to all routes
app.use(generalLimiter);

// API
app.get("/", (req: Request, res: Response) => {
  res.send("Welcome to HandyHub System Backend!");
});


app.use('/api/v1/auth', AuthRoutes)
app.use("/api/v1/users", UserRoutes);
app.use("/api/v1/appointment", AppointementRoutes);
app.use("/api/v1/techinician", TechinicianRoutes);
app.use("/api/v1/schedule", ScheduleRoutes);
app.use("/api/v1/analytics", AnalyticsRoutes);

// Global error handler and not found middleware
app.use(notFound);
app.use(globalErrorHandler);

export default app;
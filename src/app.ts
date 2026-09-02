import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";


import config from "./app/config";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { UserRoutes } from "./app/module/user/user.route";
import passport from "passport";
import { AppointementRoutes } from "./app/module/booking/booking.route";
import { TechinicianRoutes } from "./app/module/technician/techinician.route";
import { ScheduleRoutes } from "./app/module/schedule/schedule.route";


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

// API
app.get("/", (req: Request, res: Response) => {
  res.send("Welcome to HandyHub System Backend!");
});


app.use('/api/auth', AuthRoutes)
app.use("/api/users", UserRoutes);
app.use("/api/appointment", AppointementRoutes);
app.use("/api/v1/techinician", TechinicianRoutes);
app.use("/api/v1/schedule", ScheduleRoutes);
app.use("/api/booking",AppointementRoutes)

export default app;
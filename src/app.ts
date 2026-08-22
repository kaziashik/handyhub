import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";


import config from "./app/config";
import { AuthRoutes } from "./app/module/auth/auth.route";

const app: Application = express();

app.use(
  cors({
    origin: config.app_url,
    credentials: true,
  })
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// API
app.get("/", (req: Request, res: Response) => {
  res.send("Welcome to HandyHub System Backend!");
});





app.use('/api/auth', AuthRoutes)

export default app;
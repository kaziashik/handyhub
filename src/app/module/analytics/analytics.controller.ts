import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AnalyticsServices } from "./analytics.service";

const getCustomerAnalytics = catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;

    const result = await AnalyticsServices.getCustomerAnalytics(user);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Customer Analytics Retrieved Successfully",
        data: result,
    });
});

const getTechicianAnalytics= catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;

    const result = await AnalyticsServices.getTechicianAnalytics(user);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Techinician Analytics Retrieved Successfully",
        data: result,
    });
});

const getAdminAnalytics = catchAsync(async (req: Request, res: Response) => {
    const result = await AnalyticsServices.getAdminAnalytics();
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Admin Analytics Retrieved Successfully",
        data: result,
    });
});

export const AnalyticsController = {
    getAdminAnalytics,
    getCustomerAnalytics,
    getTechicianAnalytics
};

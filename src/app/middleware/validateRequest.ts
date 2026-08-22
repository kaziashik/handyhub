import { NextFunction, Request, Response } from "express";
import { z } from "zod";

export const validateRequest = <T extends z.ZodTypeAny>(zodSchema: T) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body ?? {};
    const result = zodSchema.safeParse(payload);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");

      throw new Error(message);
    }

    req.body = result.data;
    next();
  };
};
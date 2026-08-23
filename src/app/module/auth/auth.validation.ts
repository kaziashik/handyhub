import z from "zod";




const RegisterUserZodSchema = z.object({
  name: z.string().min(3).max(100),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
    .regex(/[0-9]/, "Password must contain at least one number.")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character.",
    ),
  role: z.enum(["CUSTOMER", "TECHNICIAN"]),
  phone: z.string().optional(),
});

const userEmailVerifyZodSchema = z.object({
  email: z.string().email("Invalid email address"),
  otp: z.string().length(6, "OTP must be 6 digits").regex(/^\d+$/, "OTP must contain only numbers"),
});

const LoginZodSchema = z.object({
    email : z.email(),
    password: z.string()
        .min(8, "Password Must Minimum 8 Characters Long.")
        .regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
        .regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")

        .regex(/[0-9]/, "Password must contain atleast 1 Number")
        .regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),
})

const ForgotPasswordZodSchema = z.object({
    email: z.email()
})


const ResetPasswordZodSchema = z.object({
    email: z.email(),
    newPassword: z.string()
        .min(8, "Password Must Minimum 8 Characters Long.")
        .regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
        .regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")

        .regex(/[0-9]/, "Password must contain atleast 1 Number")
        .regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),
    otp : z.string().length(6)
})




export const userValidation = {
  RegisterUserZodSchema,
    userEmailVerifyZodSchema,
    LoginZodSchema,
    ForgotPasswordZodSchema,
    ResetPasswordZodSchema
};
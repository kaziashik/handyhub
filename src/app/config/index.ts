import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });


// dotenv.config({
//   path: path.join(process.cwd(), ".env"),
//   // Allow .env files with CRLF line endings (common on Windows).
//   // dotenv v17+ does not parse \r by default and silently loads nothing otherwise.
//   quiet: true,
// });

if (!process.env.DATABASE_URL) {
  console.warn(
    "[config] DATABASE_URL missing — does your .env have CRLF line endings? Falling back to safe defaults.",
  );
}

export default {
   NODE_ENV: process.env.NODE_ENV || "development",
    port: process.env.PORT,
    database_url: process.env.DATABASE_URL,
    bak_url: process.env.APP_URL,
    app_url: process.env.APP_URL,
    frontend_url: process.env.FRONTEND_URL,
    bcrypt_salt_rounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
    jwt_access_secret: process.env.JWT_ACCESS_SECRET!,
    jwt_refresh_secret: process.env.JWT_REFRESH_SECRET!,
    jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN!,
    jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN!,
    


    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
  GOOGLE_CLIENT_CALLBACK_URL: process.env.GOOGLE_CLIENT_CALLBACK_URL!,


    super_admin_name : process.env.SUPER_ADMIN_NAME!,
	super_admin_email : process.env.SUPER_ADMIN_EMAIL!,
	super_admin_password : process.env.SUPER_ADMIN_PASSWORD!,
	tester_admin_name : process.env.TESTER_ADMIN_NAME!,
	tester_admin_email : process.env.TESTER_ADMIN_EMAIL!,
	tester_admin_password : process.env.TESTER_ADMIN_PASSWORD!,
	tester_doctor_name : process.env.TESTER_DOCTOR_NAME!,
	tester_doctor_email: process.env.TESTER_DOCTOR_EMAIL!,
	tester_doctor_password: process.env.TESTER_DOCTOR_PASSWORD!,


    redis_user : process.env.REDIS_USER!,
	redis_password : process.env.REDIS_PASSWORD!,
	redis_host : process.env.REDIS_HOST!,
	redis_port : process.env.REDIS_PORT!,
	smtp_user : process.env.SMTP_USER!,
	smtp_password : process.env.SMTP_PASSWORD!,
	email_sender : process.env.EMAIL_SENDER!,

	cloudinary_cloud_name : process.env.CLOUDINARY_CLOUD_NAME!,
	cloudinary_api_key : process.env.CLOUDINARY_API_KEY!,
	cloudinary_api_secret : process.env.CLOUDINARY_API_SECRET!,


	bkash_base_url: process.env.BKASH_BASE_URL!,
  bkash_username: process.env.BKASH_USERNAME!,
  bkash_password: process.env.BKASH_PASSWORD!,
  bkash_app_key: process.env.BKASH_APP_KEY!,
  bkash_app_secret: process.env.BKASH_APP_SECRET!,
  bkash_callback_url: process.env.BKASH_CALLBACK_URL!,
};
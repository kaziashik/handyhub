import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  APP_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().positive().default(10),

  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1),

  GOOGLE_CLIENT_ID: z.string().min(1),

  SUPER_ADMIN_NAME: z.string().min(1),
  SUPER_ADMIN_EMAIL: z.string().email(),
  SUPER_ADMIN_PASSWORD: z.string().min(8),

  REDIS_USER: z.string().min(1),
  REDIS_PASSWORD: z.string().min(1),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),

  SMTP_USER: z.string().min(1),
  SMTP_PASSWORD: z.string().min(1),
  EMAIL_SENDER: z.string().email(),

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  BKASH_BASE_URL: z.string().url(),
  BKASH_USERNAME: z.string().min(1),
  BKASH_PASSWORD: z.string().min(1),
  BKASH_APP_KEY: z.string().min(1),
  BKASH_APP_SECRET: z.string().min(1),
  BKASH_CALLBACK_URL: z.string().url(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:");
  console.error(z.treeifyError(parsedEnv.error));
  process.exit(1);
}

const env = parsedEnv.data;

export default {
  node_env: env.NODE_ENV,
  port: env.PORT,
  app_url: env.APP_URL,
  frontend_url: env.FRONTEND_URL,

  database_url: env.DATABASE_URL,

  bcrypt_salt_rounds: env.BCRYPT_SALT_ROUNDS,

  jwt_access_secret: env.JWT_ACCESS_SECRET,
  jwt_refresh_secret: env.JWT_REFRESH_SECRET,
  jwt_access_expires_in: env.JWT_ACCESS_EXPIRES_IN,
  jwt_refresh_expires_in: env.JWT_REFRESH_EXPIRES_IN,

  google_client_id: env.GOOGLE_CLIENT_ID,

  super_admin_name: env.SUPER_ADMIN_NAME,
  super_admin_email: env.SUPER_ADMIN_EMAIL,
  super_admin_password: env.SUPER_ADMIN_PASSWORD,

  redis_user: env.REDIS_USER,
  redis_password: env.REDIS_PASSWORD,
  redis_host: env.REDIS_HOST,
  redis_port: env.REDIS_PORT,

  smtp_user: env.SMTP_USER,
  smtp_password: env.SMTP_PASSWORD,
  email_sender: env.EMAIL_SENDER,

  cloudinary_cloud_name: env.CLOUDINARY_CLOUD_NAME,
  cloudinary_api_key: env.CLOUDINARY_API_KEY,
  cloudinary_api_secret: env.CLOUDINARY_API_SECRET,

  bkash_base_url: env.BKASH_BASE_URL,
  bkash_username: env.BKASH_USERNAME,
  bkash_password: env.BKASH_PASSWORD,
  bkash_app_key: env.BKASH_APP_KEY,
  bkash_app_secret: env.BKASH_APP_SECRET,
  bkash_callback_url: env.BKASH_CALLBACK_URL,
};
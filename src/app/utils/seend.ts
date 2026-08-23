import bcrypt from "bcryptjs";
import { Role } from "../../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import config from "../config";


export const seedSuperAdmin = async () => {
  try {
    const isSuperAdminExist = await prisma.user.findFirst({
      where: { role: Role.ADMIN },
    });

    if (isSuperAdminExist) {
      console.log("Admin already exists!");
      return;
    }

    const { super_admin_name: name, super_admin_email: email, super_admin_password: password } = config;

    if (!name || !email || !password) {
      throw new Error("Super admin name, email, or password missing in env file!");
    }

    const hashedPassword = await bcrypt.hash(password, config.bcrypt_salt_rounds);

    const superAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.ADMIN,
        isVerified: true,
      },
      omit: { password: true },
    });

    console.log("Super admin created:", superAdmin);
  } catch (error) {
    console.log("Error seeding super admin:", error);
  }
};
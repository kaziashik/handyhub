import "dotenv/config";
import app from "./app";
import config from "./app/config";
import { prisma } from "./app/lib/prisma";
import { transporter } from "./app/lib/nodemailer";
import { redisClient } from "./app/lib/redits";
import { seedSuperAdmin } from "./app/utils/seend";
import { deleteUnverifiedTechinician } from "./app/lib/cron";



const PORT = config.port;

async function main() {
  try {
    await prisma.$connect();
    console.log("Connected to the database successfully.");

       await redisClient.connect();
        console.log("Redis Connected Successfully");

     await transporter.verify();
        console.log("NodeMailer connected successfully");

        await seedSuperAdmin()
        await deleteUnverifiedTechinician();

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });


  } catch (error) {
    console.error("Error starting the server:", error);
    // await prisma.$disconnect();
    process.exit(1);
  }
}

main();
import cron from "node-cron";
import { prisma } from "./prisma";
import { Role, TechinicianVerificationStatus } from "../../generated/prisma/enums";

export const deleteUnverifiedTechinician = async () => {
  cron.schedule("* */10 * * * *", async () => {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);


      const deletedTechinician = await prisma.user.deleteMany({
        where: {
          role: Role.TECHNICIAN,
          emailVerified: false,
          createdAt: { lt: oneHourAgo },
          techinician: {
            verificationStatus: TechinicianVerificationStatus.PENDING,
          },
        },
      });

      if (deletedTechinician.count > 0) {
        console.log(`
                Cron: Deleted ${deletedTechinician.count} unverified email doctor applications older than 1 hour
                `);
      }

      const deletedRejectedTechinician = await prisma.user.deleteMany({
        where: {
          role: Role.TECHNICIAN,
          techinician: {
            verificationStatus: TechinicianVerificationStatus.REJECTED,
            reviewedAt: {
              lt: thirtyDaysAgo,
            },
          },
        },
      });

      if (deletedRejectedTechinician.count > 0) {
        console.log(
          `Cron: Deleted ${deletedRejectedTechinician.count} rejected Techinician  applications older than 30 days`,
        );
      }
    } catch (error) {
      console.log(
        "Cron: Failed to delete unverified Techinican applications",
        error,
      );
    }

    console.log("Unverified Techinican Delete cron schedule (every 10 minutes)");
  });
};

import { AppointmentStatus, PaymentStatus, ScheduleStatus, TechinicianVerificationStatus } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import httpStatus from "http-status"
import { AppError } from "../../utils/AppError";

const getAdminAnalytics = async () => {

    //total totalTechician

    const totalTechician = await prisma.techinician.count({
        where : {
            isDeleted : false,
        }
    })

    const totalPendingTechicianApplications = await prisma.techinician.count({
        where: {
            isDeleted: false,
            verificationStatus : TechinicianVerificationStatus.PENDING
        }
    })

    const totalApprovedTechician = await prisma.techinician.count({
        where: {
            isDeleted: false,
            verificationStatus: TechinicianVerificationStatus.APPROVED,
        },
    });
    const totalRejectedTechician = await prisma.techinician.count({
        where: {
            isDeleted: false,
            verificationStatus: TechinicianVerificationStatus.REJECTED,
        },
    });


    const totalCustomer = await prisma.customer.count({
        where: { isDeleted: false },
    });

    const totalAppointments = await prisma.apppointment.count();

    const totalCompletedAppointments = await prisma.apppointment.count({
        where: { status: AppointmentStatus.COMPLETED },
    });

    const totalCancelledAppointments = await prisma.apppointment.count({
        where: { status: AppointmentStatus.CANCELLED },
    });

    const totalRefundResult = await prisma.payment.aggregate({
        where: {
            status: PaymentStatus.PAID
        },
        _sum: {
            amount: true
        }
    })

    const totalRefunded = totalRefundResult._sum.amount?.toNumber() || 0

    const totalRevenueResult = await prisma.payment.aggregate({
        where : {
            status : PaymentStatus.PAID
        },
        _sum : {
            amount : true
        }
    })

    const totalRevenue = (totalRevenueResult._sum.amount?.toNumber() || 0) - totalRefunded 

    

    return {
        totalTechician,
        totalPendingTechicianApplications,
        totalApprovedTechician,
        totalRejectedTechician,
        totalCustomer,
        totalAppointments,
        totalCompletedAppointments,
        totalCancelledAppointments,
        totalRevenue,
        totalRefunded
    }


}
const getCustomerAnalytics = async (user : RequestUser) => {

    const customer = await prisma.customer.findUnique({
        where: { userId: user.userId },
    });

    if (!customer) {
        throw new AppError(httpStatus.NOT_FOUND, "customer Profile Not Found");
    }

    const totalAppointments = await prisma.apppointment.count({
        where: { customerId: customer.id },
    });

    const upcomingAppointments = await prisma.apppointment.count({
        where: { customerId: customer.id, status: AppointmentStatus.CONFIRMED },
    });

    const completedAppointments = await prisma.apppointment.count({
        where: { customerId: customer.id, status: AppointmentStatus.COMPLETED },
    });

    const cancelledAppointments = await prisma.apppointment.count({
        where: { customerId: customer.id, status: AppointmentStatus.CANCELLED },
    });

    const totalAmountSpentResult = await prisma.payment.aggregate({
        where: {
            appointment: {
                customerId: customer.id,
            },
            status: PaymentStatus.PAID,
        },
        _sum: {
            amount: true,
        },
    });

    const totalAmountSpent = totalAmountSpentResult._sum.amount?.toNumber() || 0;

    const totalRefundedResult = await prisma.payment.aggregate({
        where: {
            appointment: {
                customerId: customer.id,
            },
            status: PaymentStatus.REFUNDED,
        },
        _sum: {
            amount: true,
        },
    });

    const totalRefunded = totalRefundedResult._sum.amount?.toNumber() || 0;

    return {
        totalAppointments,
        upcomingAppointments,
        completedAppointments,
        cancelledAppointments,
        totalAmountSpent,
        totalRefunded
    }


}
const getTechicianAnalytics = async (user : RequestUser) => {
    const techinician = await prisma.techinician.findUnique({
        where: { userId: user.userId },
    });

    if (!techinician) {
        throw new AppError(httpStatus.NOT_FOUND, "techinician Profile Not Found");
    }

    const totalSchedules = await prisma.schedule.count({
        where: { techinicianId: techinician.id, isDeleted: false },
    });

    const publishedSchedules = await prisma.schedule.count({
        where: {
            techinicianId: techinician.id,
            isDeleted: false,
            status: ScheduleStatus.PUBLISHED,
        },
    });

    const totalAppointments = await prisma.apppointment.count({
        where: { techinicianId: techinician.id },
    });

    const upcomingAppointments = await prisma.apppointment.count({
        where: { techinicianId: techinician.id, status: AppointmentStatus.CONFIRMED },
    });

    const ongoingAppointments = await prisma.apppointment.count({
        where: { techinicianId: techinician.id, status: AppointmentStatus.ONGOING },
    });

    const completedAppointments = await prisma.apppointment.count({
        where: { techinicianId: techinician.id, status: AppointmentStatus.COMPLETED },
    });

    const cancelledAppointments = await prisma.apppointment.count({
        where: { techinicianId: techinician.id, status: AppointmentStatus.CANCELLED },
    });

    const totaltechinicianRefundedResult = await prisma.payment.aggregate({
        where: {
            appointment: {
                techinicianId: techinician.id,
            },
            status: PaymentStatus.REFUNDED,
        },
        _sum: {
            amount: true,
        },
    });

    const totaltechinicianRefunded = totaltechinicianRefundedResult._sum.amount?.toNumber() || 0;

    const totaltechinicianEarningsResult = await prisma.payment.aggregate({
        where: {
            appointment: {
                techinicianId: techinician.id,
            },
            status: PaymentStatus.PAID,
        },
        _sum: {
            amount: true,
        },
    });

    const totaltechinicianEarnings = (totaltechinicianEarningsResult._sum.amount?.toNumber() || 0) - totaltechinicianRefunded;

    

    return {
        totalSchedules,
        publishedSchedules,
        totalAppointments,
        upcomingAppointments,
        ongoingAppointments,
        completedAppointments,
        cancelledAppointments,
        totaltechinicianEarnings,
        totaltechinicianRefunded
    }

}

export const AnalyticsServices = {
    getAdminAnalytics,
    getCustomerAnalytics,
    getTechicianAnalytics
}
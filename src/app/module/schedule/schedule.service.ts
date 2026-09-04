import { addDays, differenceInMinutes, isAfter, isSameDay, startOfDay } from "date-fns";
import httpStatus from "http-status";
import { ScheduleStatus } from "../../../generated/prisma/enums";
import { ScheduleWhereInput } from "../../../generated/prisma/models";

import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { ICreateSchedulePayload, IUpdateSchedulePayload } from "./schedule.interface";
import { IQuery } from "../../interface";


const createSchedule = async (payload : ICreateSchedulePayload , user : RequestUser) => {

    const techinician= await prisma.techinician.findUnique({
        where: { userId: user.userId },
    });

    if (!techinician) {
        throw new AppError(httpStatus.NOT_FOUND, "techinician Profile Not Found");
    }

    // 25 August => start Time  : 9:00 PM 
    // 26 August => end Time : 3:00AM

    if(!isSameDay(payload.startDateTime, payload.endDateTime)){ 
        throw new AppError(httpStatus.CONFLICT, "Start Date Time And End Date Time Must Be On The Same Day")
    }
    if(isAfter(payload.startDateTime, payload.endDateTime)){ // 25 August =>  3:00 PM - 9:00 PM

        throw new AppError(httpStatus.CONFLICT, "Start Date Time Cannot Be After End Date Time")
    }


    //startDateTime = 2026-08-25T13:30:00.436Z => 1:30 PM
    const startOfTheDay = startOfDay(payload.startDateTime) // 25 August => 12:00 AM => 2026-08-25T00:00:00.436Z
    const startOfNextDay = addDays(startOfTheDay, 1)  // 26 August => 12:00 AM => 2026-08-26T00:00:00.436Z

    const existingScheduleOnThisDate = await prisma.schedule.findFirst({
        where : {
            techinicianId : techinician.id,
            isDeleted : false,
            startDateTime : {
                gte : startOfTheDay,
                lt : startOfNextDay
            }
        }
    })

    if(existingScheduleOnThisDate) {
        throw new AppError(
            httpStatus.CONFLICT,
            "You Already Have A Schedule For This Date",
        );
    }


    const durationInMinutes = differenceInMinutes(
        payload.endDateTime,
        payload.startDateTime
    )

    const MINUTES_ALLOCATED_PER_SLOT = 20

    const totalSlots = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT)

    if (totalSlots < 1) {
        throw new AppError(
            httpStatus.CONFLICT,
            `Schedule Must Be At Least ${MINUTES_ALLOCATED_PER_SLOT} Minutes Long To Fit One Slot`,
        );
    }

    const schedule = await prisma.schedule.create({
        data : {
            startDateTime : payload.startDateTime,
            endDateTime : payload.endDateTime,
            meetingLink : payload.meetingLink,
            totalSlots,
            availableSlots : totalSlots,
            techinicianId : techinician.id
        },
        include : {
            techinician : {
                select : {
                    name : true,
                    email : true,
                    contactNumber : true
                }
            }
        }
    })

    return schedule
}

const getMySchedules = async (query : IQuery, user : RequestUser) => {

    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc"

    const techinician = await prisma.techinician.findUnique({
        where: { userId: user.userId },
    });

    if (!techinician) {
        throw new AppError(httpStatus.NOT_FOUND, "techinician Profile Not Found");
    }

    // let limit = 10;
    // if (query.limit) {
    //     limit = Number(query.limit);
    // }

    // let page = 1;
    // if (query.page) {
    //     page = Number(query.page);
    // }

    // const skip = (page - 1) * limit;

    

    const andConditions: ScheduleWhereInput[] = [
        {
            techinicianId : techinician.id
        },
        {
            isDeleted : false
        }
    ];

    if (query.status) {
        andConditions.push({ status: query.status });
    }

    const schedules = await prisma.schedule.findMany({
        where : {
            AND : andConditions
        },

        take: limit,
        skip,
        orderBy: {
            // sortBy : sortOrder
            [sortBy]: sortOrder
        },
        include : {
            appointments : {
                include : {
                    customer : true
                }
            }
        }
    })

    const total = await prisma.schedule.count({ where: { AND: andConditions } });

    return {
        data: schedules,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };

}

const getAllSchedules = async (query : IQuery) => {

    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc"

    const andConditions: ScheduleWhereInput[] = [];

    if (query.techinicianId) {
        andConditions.push({ techinicianId: query.techinicianId });
    }
    if (query.email) {
        andConditions.push({ techinician : {
            email : query.email
        } });
    }

    if (query.status) {
        andConditions.push({ status: query.status });
    }

    if (query.searchTerm) {
        andConditions.push({
            techinician: {
                OR: [
                    { name: { contains: query.searchTerm, mode: "insensitive" } },
                    { email: { contains: query.searchTerm, mode: "insensitive" } },
                    {
                        specialization: { contains: query.searchTerm, mode: "insensitive" },
                    },
                ],
            },
        });
    };

    const schedules = await prisma.schedule.findMany({
        where: {
            AND: andConditions
        },

        take: limit,
        skip,
        orderBy: {
            // sortBy : sortOrder
            [sortBy]: sortOrder
        },
        include: {
            appointments: {
                include: {
                    customer: true
                }
            }
        }
    })

    const total = await prisma.schedule.count({ where: { AND: andConditions } });

    return {
        data: schedules,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };

}

const getScheduleById = async (scheduleId : string) => {

    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        include: {
            techinician: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    specialization: true,
                    userId: true,
                },
            },
            appointments: {
                include: {
                    customer: true
                },
            }
        },
    });

    if(!schedule || schedule.isDeleted){
        throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    return schedule

}

const updateSchedule = async (scheduleId : string, payload : IUpdateSchedulePayload, user : RequestUser) => {

    const techinician = await prisma.techinician.findUnique({
        where: { userId: user.userId },
    });

    if (!techinician) {
        throw new AppError(httpStatus.NOT_FOUND, "Techinician Profile Not Found");
    }

    const schedule = await prisma.schedule.findUnique({
        where : { id : scheduleId, techinicianId : techinician.id}
    })

    if (!schedule || schedule.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    if(schedule.status === ScheduleStatus.PUBLISHED && schedule.totalSlots !== schedule.availableSlots){
        throw new AppError(httpStatus.CONFLICT, "Schedule Once Published And Appoinemtn Booked Cannot Be Updated");
    }

    // if (schedule.doctorId !== doctor.id) {
    //     throw new AppError(
    //         httpStatus.FORBIDDEN,
    //         "You Are Not Allowed To Update This Schedule",
    //     );
    // }


    // const updateData : IUpdateSchedulePayload = {};

    // if(payload.meetingLink){
    //     updateData.meetingLink = payload.meetingLink || schedule.meetingLink
    // }

    payload.meetingLink = payload.meetingLink || schedule.meetingLink
    payload.startDateTime = payload.startDateTime || schedule.startDateTime
    payload.endDateTime = payload.endDateTime || schedule.endDateTime


    // 25 August => start Time  : 9:00 PM 
    // 26 August => end Time : 3:00AM

    if (!isSameDay(payload.startDateTime, payload.endDateTime)) {
        throw new AppError(httpStatus.CONFLICT, "Start Date Time And End Date Time Must Be On The Same Day")
    }
    if (isAfter(payload.startDateTime, payload.endDateTime)) { // 25 August =>  3:00 PM - 9:00 PM

        throw new AppError(httpStatus.CONFLICT, "Start Date Time Cannot Be After End Date Time")
    }

    //startDateTime = 2026-08-25T13:30:00.436Z => 1:30 PM
    const startOfTheDay = startOfDay(payload.startDateTime) // 25 August => 12:00 AM => 2026-08-25T00:00:00.436Z
    const startOfNextDay = addDays(startOfTheDay, 1)  // 26 August => 12:00 AM => 2026-08-26T00:00:00.436Z

    const existingScheduleOnThisDate = await prisma.schedule.findFirst({
        where: {
            techinicianId: techinician.id,
            isDeleted: false,
            startDateTime: {
                gte: startOfTheDay,
                lt: startOfNextDay
            }
        }
    })

    if (existingScheduleOnThisDate) {
        throw new AppError(
            httpStatus.CONFLICT,
            "You Already Have A Schedule For This Date",
        );
    }

    const durationInMinutes = differenceInMinutes(
        payload.endDateTime,
        payload.startDateTime
    )

    const MINUTES_ALLOCATED_PER_SLOT = 20

    const totalSlots = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT)

    if (totalSlots < 1) {
        throw new AppError(
            httpStatus.CONFLICT,
            `Schedule Must Be At Least ${MINUTES_ALLOCATED_PER_SLOT} Minutes Long To Fit One Slot`,
        );
    }

    const updatedSchedule = await prisma.schedule.update({
        where : {
            id : schedule.id
        },
        data: {
            startDateTime: payload.startDateTime,
            endDateTime: payload.endDateTime,
            meetingLink: payload.meetingLink,
            totalSlots,
            availableSlots: totalSlots,
            techinicianId: techinician.id
        },
        include: {
            techinician: {
                select: {
                    name: true,
                    email: true,
                    contactNumber: true
                }
            }
        }
    })

    return updatedSchedule
}

const publishSchedule = async (scheduleId : string, user : RequestUser) => {
    const doctor = await prisma.techinician.findUnique({
        where: { userId: user.userId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId, techinicianId : doctor.id },
    });

    if (!schedule || schedule.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    if (schedule.status === ScheduleStatus.PUBLISHED) {
        throw new AppError(httpStatus.CONFLICT, "Schedule Is Already Published");
    }

    const publishedSchedule = await prisma.schedule.update({
        where: { id: schedule.id },
        data: { status: ScheduleStatus.PUBLISHED },
    });

    return publishedSchedule;
}

const deleteSchedule = async (scheduleId: string, user: RequestUser) => {
    const doctor = await prisma.techinician.findUnique({
        where: { userId: user.userId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId, techinicianId: doctor.id },
    });

    if (!schedule || schedule.isDeleted) {
        throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    if (schedule.status === ScheduleStatus.PUBLISHED && schedule.totalSlots !== schedule.availableSlots) {
        throw new AppError(httpStatus.CONFLICT, "Schedule Once Published And Appoinement Booked Cannot Be Deleted");
    };

    const deletedSchedule = await prisma.schedule.update({
        where: { id: schedule.id },
        data: { isDeleted: true, deletedAt: new Date() },
    });

    return deletedSchedule;
}


const getTodaysSchedules = async (query : IQuery) => {
    if(!query.doctorId){
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Id Must Be Provided In Query")
    }

    const doctor = await prisma.techinician.findUnique({
        where: { id : query.doctorId },
    });

    if (!doctor) {
        throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
    }

    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ? query.sortBy : "createdAt";
    const sortOrder = query.sortOrder ? query.sortOrder : "desc"

    const now = new Date();
    const startOfToday = startOfDay(now);
    const startOfTomorrow = addDays(startOfToday, 1)

    const andConditions: ScheduleWhereInput[] = [
        {
            techinicianId : query.doctorId
        },
        {
            isDeleted : false
        },
        {
            status : ScheduleStatus.PUBLISHED
        },
        {
            startDateTime : {
                gte : startOfToday,
                lt : startOfTomorrow,
                gt: now
            }
        },
        {
            availableSlots : { gt : 0}
        }
    ];

    const schedules = await prisma.schedule.findMany({
        where: {
            AND: andConditions
        },

        take: limit,
        skip,
        orderBy: {
            // sortBy : sortOrder
            [sortBy]: sortOrder
        }
    })

    const total = await prisma.schedule.count({ where: { AND: andConditions } });

    return {
        data: schedules,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}



export const ScheduleServices = {
    createSchedule,
    getMySchedules,
    getAllSchedules,
    getScheduleById,
    updateSchedule,
    publishSchedule,
    deleteSchedule,
    getTodaysSchedules
}
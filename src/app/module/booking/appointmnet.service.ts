import { AppointmentStatus, PaymentStatus, Role, ScheduleStatus } from "../../../generated/prisma/enums";
import { addMinutes, isBefore, isSameDay, subHours } from "date-fns";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status";
import { transporter } from "../../lib/nodemailer";



import PDFDocument from "pdfkit";
import { ICancelAppointmentPayload, IPayAppointmentPayload, IUpdateAppointmentStatusPayload } from "./appointment.interface";
import { IQuery } from "../../interface";
import { ApppointmentWhereInput } from "../../../generated/prisma/models";

const bookAppointment = async (payload: any, user: RequestUser) => {
  // 1. Validate + create the appointment + reserve the slot — all inside one transaction
  const { appointment, amount } = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { userId: user.userId },
    });

    if (!customer) {
      throw new AppError(httpStatus.NOT_FOUND, "Customer Profile Not Found");
    }

    const schedule = await tx.schedule.findUnique({
      where: { id: payload.scheduleId },
      include: { techinician: true },
    });

    if (!schedule || schedule.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    if (schedule.status !== ScheduleStatus.PUBLISHED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Not Published Yet",
      );
    }

    const now = new Date();

    if (!isSameDay(now, schedule.startDateTime)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Not Available Today",
      );
    }

    if (!isBefore(now, schedule.startDateTime)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Has Already Started",
      );
    }

    const existingAppointment = await tx.apppointment.findFirst({
      where: {
        customerId: customer.id, // fixed: was customerIdId
        scheduleId: schedule.id,
      },
    });

    if (existingAppointment?.status === AppointmentStatus.PENDING) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Pending Appointment. Please Pay For That",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.CONFIRMED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Confirmed Appointment.",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.ONGOING) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Ongoing Appointment",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.COMPLETED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have Completed An Appointment On This Schedule. Please Try Again Another Day",
      );
    }

    // re-fetch-safe check: still validated inside the tx before decrementing
    if (schedule.availableSlots <= 0) {
      throw new AppError(httpStatus.BAD_REQUEST, "This Schedule Is Fully Booked");
    }

    if (!schedule.techinician.consultationFee) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Techinicen Has Not Set A Consultation Fee Yet",
      );
    }

    const amount = schedule.techinician.consultationFee.toString();

    const appointment = await tx.apppointment.create({
      data: {
        status: AppointmentStatus.PENDING,
        customerId: customer.id,
        techinicianId: schedule.techinician.id,
        scheduleId: schedule.id,
      },
    });

    // decrement slot count atomically inside the same transaction
    // guard with a where clause so two concurrent requests can't both succeed on the last slot
    const updatedSchedule = await tx.schedule.updateMany({
      where: {
        id: schedule.id,
        availableSlots: { gt: 0 },
      },
      data: {
        availableSlots: { decrement: 1 },
      },
    });

    if (updatedSchedule.count === 0) {
      // someone else took the last slot between our read and this write
      throw new AppError(httpStatus.BAD_REQUEST, "This Schedule Is Fully Booked");
    }

    return { appointment, amount };
  });

  // 2. Call bKash OUTSIDE the DB transaction — no reason to hold a DB tx open for a network call
  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
  }

  const bkashCreatePaymentResponse = await fetch(
    `${config.bkash_base_url}/tokenized/checkout/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-App-Key": config.bkash_app_key,
      },
      body: JSON.stringify({
        mode: "0011",
        payerReference: user.email,
        callbackURL: `${config.bkash_callback_url}/api/v1/appointment/book-appointment/payment/callback`,
        amount: amount,
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: appointment.id,
      }),
    },
  );

  const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

  if (!bkashCreatePaymentResponse.ok) {
    // payment initiation failed — release the slot and cancel the appointment
    await prisma.$transaction([
      prisma.apppointment.update({
        where: { id: appointment.id },
        data: { status: AppointmentStatus.CANCELLED },
      }),
      prisma.schedule.update({
        where: { id: appointment.scheduleId },
        data: { availableSlots: { increment: 1 } },
      }),
    ]);

    throw new AppError(
      httpStatus.BAD_GATEWAY,
      "Failed To Initiate Bkash Payment",
    );
  }

  // 3. Persist the payment record
  await prisma.payment.create({
    data: {
      merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
      appointmentId: appointment.id,
      amount: amount,
      gatewayResponse: bkashCreatePaymentResult,
      bkashPaymentId: bkashCreatePaymentResult.paymentID,
      payerReference: user.email,
    },
  });

  return {
    paymentUrl: bkashCreatePaymentResult.bkashURL,
  };
};



const bookAppointmentCallback = async (query: Record<string, any>) => {
	const paymentId = query.paymentID;

	if (!paymentId) {
		throw new AppError(httpStatus.BAD_REQUEST, "Payment Id Missing");
	}

	const status = query.status;

	if (!status) {
		throw new AppError(httpStatus.BAD_REQUEST, "Payment Status is Missing");
	}

	// bKash execute call kept OUTSIDE the DB transaction — no reason to hold
	// a DB transaction open while waiting on a slow external network call.
	const bkashIdToken = await getBkashIdToken();

	if (!bkashIdToken) {
		throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
	}

	const executedPaymentResponse = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/execute`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: bkashIdToken,
				"X-App-Key": config.bkash_app_key,
			},
			body: JSON.stringify({ paymentID: paymentId }),
		},
	);

	if (!executedPaymentResponse.ok) {
		throw new AppError(httpStatus.BAD_GATEWAY, "Failed To Execute Bkash Payment");
	}

	const executedPaymentResult = await executedPaymentResponse.json();

	if (status === "success") {
		const appointmentId = executedPaymentResult.merchantInvoiceNumber;

		// All DB reads/writes inside the transaction now consistently use `tx`.
		const { appointment, joiningTime, serialNumber } = await prisma.$transaction(
			async (tx) => {
				const appointment = await tx.apppointment.findUnique({
					where: { id: appointmentId },
					include: {
						schedule: true,
						customer: true,
						techinician: true,
					},
				});

				if (!appointment) {
					throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found!");
				}

				// Idempotency guard — bKash callbacks can be retried/duplicated.
				// Without this, a retry would re-decrement slots and resend the invoice email.
				if (appointment.status === AppointmentStatus.CONFIRMED) {
					return {
						appointment,
						joiningTime: appointment.joiningTime!,
						serialNumber: appointment.serialNumber!,
					};
				}

				// total slot = 3, available slot = 2 => (total - available) + 1
				const alreadyBookedSlots =
					appointment.schedule.totalSlots - appointment.schedule.availableSlots;
				const serialNumber = alreadyBookedSlots + 1;

				const joiningTime = addMinutes(
					appointment.schedule.startDateTime,
					(serialNumber - 1) * 20,
				);

				await tx.apppointment.update({
					where: { id: appointmentId },
					data: {
						status: AppointmentStatus.CONFIRMED,
						joiningTime,
						serialNumber,
					},
				});

				// Atomic decrement guarded with gt:0 — avoids the race condition of
				// read-then-subtract, and can never go negative.
				const scheduleUpdateResult = await tx.schedule.updateMany({
					where: {
						id: appointment.schedule.id,
						availableSlots: { gt: 0 },
					},
					data: {
						availableSlots: { decrement: 1 },
					},
				});

				if (scheduleUpdateResult.count === 0) {
					throw new AppError(
						httpStatus.CONFLICT,
						"No Available Slots Left To Confirm This Appointment",
					);
				}

				// Look up the payment by appointmentId, then verify bkashPaymentId matches,
				// instead of relying on a compound where clause that may not be a real
				// unique constraint.
				const payment = await tx.payment.findUnique({
					where: { appointmentId },
				});

				if (!payment || payment.bkashPaymentId !== paymentId) {
					throw new AppError(
						httpStatus.BAD_REQUEST,
						"Payment Record Mismatch For This Appointment",
					);
				}

				await tx.payment.update({
					where: { id: payment.id },
					data: {
						status: PaymentStatus.PAID,
						bkashTrxId: executedPaymentResult.trxID,
						paidAt: executedPaymentResult.paymentExecuteTime,
						gatewayResponse: executedPaymentResult,
					},
				});

				return { appointment, joiningTime, serialNumber };
			},
			{ maxWait: 10000, timeout: 30000 },
		);

		const customer = appointment.customer;

		if (!customer) {
			throw new AppError(httpStatus.NOT_FOUND, "Customer Not Found On Appointment");
		}

		// PDF generation + emailing kept OUTSIDE the DB transaction — these are slow,
		// non-atomic side effects that shouldn't hold the transaction open.
		const pdfDocument = new PDFDocument({ margin: 50 });
		const pdfChunks: Buffer[] = [];

		pdfDocument.on("data", (chunk: Buffer) => {
			pdfChunks.push(chunk);
		});

		const pdfReadyPromise = new Promise<Buffer>((resolve) => {
			pdfDocument.on("end", () => {
				resolve(Buffer.concat(pdfChunks));
			});
		});

		pdfDocument.fontSize(20).text("PH Healthcare System", { align: "center" });
		pdfDocument.fontSize(14).text("Appointment Invoice", { align: "center" });
		pdfDocument.moveDown(2);

		pdfDocument.fontSize(12).text(`Patient Name: ${customer.name}`);
		pdfDocument.text(`Patient Email: ${customer.email}`);
		pdfDocument.moveDown();

		pdfDocument.text(`Doctor Name: ${appointment.techinician?.name}`);
		pdfDocument.text(`Specialization: ${appointment.techinician?.specialization}`);
		pdfDocument.moveDown();

		pdfDocument.text(
			`Appointment Date: ${appointment.schedule.startDateTime.toDateString()}`,
		);
		pdfDocument.text(`Your Joining Time: ${joiningTime.toString()}`);
		pdfDocument.text(`Your Serial Number: ${serialNumber}`);
		pdfDocument.text(`Meeting Link: ${appointment.schedule.meetingLink}`);
		pdfDocument.moveDown();

		pdfDocument.text(`Amount Paid: ${executedPaymentResult.amount} BDT`);
		pdfDocument.text(`Payment Method: bKash`);
		pdfDocument.text(`Transaction Id: ${executedPaymentResult.trxID}`);
		pdfDocument.text(`Paid At: ${executedPaymentResult.paymentExecuteTime}`);

		pdfDocument.end();

		const pdfBuffer = await pdfReadyPromise;

		// Email failure shouldn't break the booking flow, which already succeeded in the DB.
		try {
			await transporter.sendMail({
				from: config.email_sender,
				to: customer.email,
				subject: "Your Appointment Invoice - PH Healthcare System",
				text: "Thank you for booking an appointment. Please find your invoice attached.",
				attachments: [{ filename: "invoice.pdf", content: pdfBuffer }],
			});
		} catch (emailError) {
			console.error("Failed to send invoice email:", emailError);
		}

		return {
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
		};
	} else if (status === "failure") {
		await prisma.payment.update({
			where: { bkashPaymentId: paymentId },
			data: {
				status: PaymentStatus.FAILED,
				gatewayResponse: executedPaymentResult,
			},
		});
		return {
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
		};
	} else if (status === "cancel") {
		await prisma.payment.update({
			where: { bkashPaymentId: paymentId },
			data: {
				status: PaymentStatus.CANCELLED,
				gatewayResponse: executedPaymentResult,
			},
		});
		return {
			executedPaymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
		};
	} else {
		return {
			executedPaymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`,
		};
	}
};



const payAppointment = async (payload: IPayAppointmentPayload, user: RequestUser) => {
	const appointmentId = payload.appointmentId;

	const existingAppointment = await prisma.apppointment.findUnique({
		where: {
			id: appointmentId,
		},
		include : {
			schedule : {
				include : {
					techinician : true
				}
			}
		}
	});

	if (!existingAppointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Does Not Exists");
	}

	if (existingAppointment.status !== "PENDING") {
		throw new AppError(httpStatus.BAD_REQUEST, "Appointment Is Not Pending!");
	}

	// if (existingAppointment.status === "CANCELLED" || existingAppointment.status === "ONGOING" || existingAppointment.status === "COMPLETED"){
	//     const appointmentStatus = existingAppointment.status
	//     throw new Error(`Appointment is already ${appointmentStatus.toLowerCase}`)
	// }

	if (!existingAppointment.schedule.techinician.consultationFee){
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Doctor Has Not Set A Consultation Fee Yet",
		);
	}


	const amount = existingAppointment.schedule.techinician.consultationFee.toString();
	const bkashIdToken = await getBkashIdToken();

	if (!bkashIdToken) {
		throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
	}

	const bkashCreatePaymentResponse = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/create`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: bkashIdToken,
				"X-App-Key": config.bkash_app_key,
			},
			body: JSON.stringify({
				mode: "0011",
				// payerReference: "0123456789", //user email or phone number
				payerReference: user.email, //user email or phone number
				callbackURL: `${config.bkash_callback_url}/api/v1/appointment/book-appointment/payment/callback`,
				amount: amount,
				currency: "BDT",
				intent: "sale",
				// merchantInvoiceNumber: "Inv4" // apppointment id
				merchantInvoiceNumber: existingAppointment.id, // apppointment id
			}),
		},
	);

	const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

	await prisma.payment.update({
		where: {
			appointmentId: existingAppointment.id,
		},

		data: {
			merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
			gatewayResponse: bkashCreatePaymentResult,
			bkashPaymentId: bkashCreatePaymentResult.paymentID,
		},
	});

	return {
		paymentUrl: bkashCreatePaymentResult.bkashURL,
	};
};


const cancelAppointment = async (payload: ICancelAppointmentPayload, user : RequestUser) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const appointmentId = payload.appointmentId;

		const existingAppointment = await tx.apppointment.findUnique({
		where: {
			id: appointmentId,
			customer : {
				email : user.email
			}
		},
			include: {
				payment: true,
				schedule : true
			},
		});

		if (!existingAppointment) {
			throw new AppError(httpStatus.NOT_FOUND, "Appointment Does Not Exists");
		}

		if (
			existingAppointment.status === "ONGOING" ||
			existingAppointment.status === "COMPLETED"
		) {
			throw new AppError(httpStatus.BAD_REQUEST, "Appointment Ongoing or Completed");
		}

		if (existingAppointment.status === "CANCELLED") {
			throw new AppError(httpStatus.BAD_REQUEST, "Appointment Already Cancelled");
		}

		const updatedAppointment = await tx.apppointment.update({
			where: {
				id: existingAppointment.id,
			},
			data: {
				status: AppointmentStatus.CANCELLED,
			},
		});

		await prisma.schedule.update({
			where : {
				id : existingAppointment.schedule.id
			},
			data : {
				availableSlots : {increment : 1}
			}
		})

		// refund process
		const now = new Date();
		const startDateTime = existingAppointment.schedule.startDateTime; // 25 August : 3:00 PM

		// After 2:00 Pm => no refund
		// must cancel before  2:00 PM
		const refundCutOffTime = subHours(startDateTime, 1)

		// now >  refuncCutOff Time => no refund
		// now < refundCutOff Time => refund eligible
		const isEligibleForRefund = isBefore(now, refundCutOffTime)

		if(isEligibleForRefund){

			const bkashIdToken = await getBkashIdToken();

			if (!bkashIdToken) {
				throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
			}

			const bkashRefundPaymentResponse = await fetch(
				`${config.bkash_base_url}/tokenized/checkout/payment/refund`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						Authorization: bkashIdToken,
						"X-App-Key": config.bkash_app_key,
					},
					body: JSON.stringify({
						paymentID: existingAppointment.payment?.bkashPaymentId,
						trxID: existingAppointment.payment?.bkashTrxId,
						amount: existingAppointment.payment?.amount.toString(),
						sku: "Appointment Cancellation",
						reason: "Patient Cancelled The Appointment",
					}),
				},
			);

			const bkashRefundPaymentResult = await bkashRefundPaymentResponse.json();

			await tx.payment.update({
				where: {
					appointmentId: existingAppointment.id,
				},
				data: {
					refundTrxId: bkashRefundPaymentResult.refundTrxID,
					refundedAt: bkashRefundPaymentResult.completedTime,
					refundAmount: bkashRefundPaymentResult.amount,
					refundReason: "Patient Cancelled The Appointment",
					status: PaymentStatus.REFUNDED,
					gatewayResponse: bkashRefundPaymentResult,
				},
			});

		}

		const newPaymentInfo = await prisma.payment.findUnique({
			where: {
				appointmentId: existingAppointment.id,
			},
		})


		

		return {
			appointment: updatedAppointment,
			payment: newPaymentInfo,
		};
	});

	return transactionResult;
};

// DOCTOR ONLY CONFIRMED => ONGOING => COMPLETED
const updateAppointmentStatus = async (
	appointmentId : string,
	payload : IUpdateAppointmentStatusPayload,
	user : RequestUser
) => {
	const techinician = await prisma.techinician.findUnique({
		where: { userId: user.userId },
	});

	if (!techinician) {
		throw new AppError(httpStatus.NOT_FOUND, "Techinician Profile Not Found");
	}

	const appointment = await prisma.apppointment.findUnique({
		where: { id: appointmentId, techinicianId : techinician.id },
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if(appointment.status === AppointmentStatus.COMPLETED){
		throw new AppError(httpStatus.FORBIDDEN, "Appointment is already completed")
	}

	if(appointment.status === AppointmentStatus.CANCELLED){
		throw new AppError(httpStatus.FORBIDDEN, "Appointment is already cancelled")
	}
	if(appointment.status === AppointmentStatus.PENDING){
		throw new AppError(httpStatus.FORBIDDEN, "Appointment is Pending. You can change the status after appointment is confirmed")
	}

	if(appointment.status === AppointmentStatus.CONFIRMED){

		if(payload.status !== "ONGOING"){
			throw new AppError(httpStatus.BAD_REQUEST, "Confirmed Appointment Must Be Ongoing At First")
		}

		await prisma.apppointment.update({
			where : {
				id : appointment.id
			},
			data : {
				status : AppointmentStatus.ONGOING
			}
		})


	}

	if(appointment.status === AppointmentStatus.ONGOING){

		if(payload.status !== "COMPLETED"){
			throw new AppError(httpStatus.BAD_REQUEST, "Ongoinf Appointment Must Be Complted.")
		}

		await prisma.apppointment.update({
			where: {
				id: appointment.id
			},
			data: {
				status: AppointmentStatus.COMPLETED
			}
		})
	}

	const updatedAppointment = await prisma.apppointment.findUnique({
		where : {
			id : appointment.id
		}
	})

	return updatedAppointment
}

//customer appointments
const getMyAppointments = async (query : IQuery, user : RequestUser) => {


	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const customer = await prisma.customer.findUnique({
		where: { userId: user.userId },
	});

	if (!customer) {
		throw new AppError(httpStatus.NOT_FOUND, "Customer Profile Not Found");
	}

	const andConditions: ApppointmentWhereInput[] = [
		{
			customerId : customer.id
		}
	];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	const appointments = await prisma.apppointment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy] : sortOrder},
		include: {
			techinician: { select: { id: true, name: true, specialization: true } },
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.apppointment.count({
		where: { AND: andConditions },
	});

	return {
		data: appointments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};


}

//techinician appointments
const getDoctorAppointments = async (query: IQuery, user: RequestUser) => {

	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const techinician = await prisma.techinician.findUnique({
		where: { userId: user.userId },
	});

	if (!techinician) {
		throw new AppError(httpStatus.NOT_FOUND, "Techinician Profile Not Found");
	}

	const andConditions: ApppointmentWhereInput[] = [
		{
			techinicianId : techinician.id
		}
	];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	const appointments = await prisma.apppointment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy] : sortOrder},
		include: {
			customer: {
				select: { id: true, name: true, email: true, contactNumber: true },
			},
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.apppointment.count({
		where: { AND: andConditions },
	});

	return {
		data: appointments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
}

//admin super admin
const getAllAppointments = async (query : IQuery) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"

	const andConditions: ApppointmentWhereInput[] = [];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	if (query.techinicianId) {
		andConditions.push({ techinicianId: query.techinicianId });
	}

	if (query.customerId) {
		andConditions.push({ customerId: query.customerId });
	}

	if(query.techinicianEmail){
		andConditions.push({
			techinician  : {
				email : query.techinicianEmail
			}
		})
	}
	if(query.customerEmail){
		andConditions.push({
			customer : {
				email : query.customerEmail
			}
		})
	}

	const appointments = await prisma.apppointment.findMany({
		where: { AND: andConditions },
		take: limit,
		skip,
		orderBy: { [sortBy] : sortOrder },
		include: {
			customer: { select: { id: true, name: true, email: true } },
			techinician: { select: { id: true, name: true, specialization: true } },
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.apppointment.count({
		where: { AND: andConditions },
	});

	return {
		data: appointments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};


}

// for all loggedin user
const getSingleAppointment = async (appointmentId : string, user : RequestUser) => {
	const appointment = await prisma.apppointment.findUnique({
		where: { id: appointmentId },
		include: {
			customer: { select: { id: true, name: true, email: true, userId: true } },
			techinician: {
				select: { id: true, name: true, specialization: true, userId: true },
			},
			schedule: true,
			payment: true,
		},
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if(user.role === Role.CUSTOMER){
		if(appointment.customer.userId !== user.userId){
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You Are Not Allowed To View This Appointment",
			);
		}
	}
	if(user.role === Role.TECHNICIAN){
		if(appointment.techinician.userId !== user.userId){
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You Are Not Allowed To View This Appointment",
			);
		}
	}

	return appointment
}

export const AppointmentServices = {
	bookAppointment,
	payAppointment,
	bookAppointmentCallback,
	cancelAppointment,
	updateAppointmentStatus,
	getMyAppointments,
	getDoctorAppointments,
	getAllAppointments,
	getSingleAppointment,
};



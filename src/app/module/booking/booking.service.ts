import { AppointmentStatus, PaymentStatus, ScheduleStatus } from "../../../generated/prisma/enums";
import { addMinutes, isBefore, isSameDay, subHours } from "date-fns";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import httpStatus from "http-status";
import { transporter } from "../../lib/nodemailer";



import PDFDocument from "pdfkit";

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
        callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
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
	const transactionResult = await prisma.$transaction(async (tx) => {
		const paymentId = query.paymentID;

		if (!paymentId) {
			throw new AppError(httpStatus.BAD_REQUEST, "Payment Id Missing");
		}

		const status = query.status;

		if (!status) {
			throw new AppError(httpStatus.BAD_REQUEST, "Payment Status is Missing");
		}

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

				body: JSON.stringify({
					paymentID: paymentId,
				}),
			},
		);

		const executedPaymentResult = await executedPaymentResponse.json();

		if (status === "success") {

			const appointment = await prisma.apppointment.findUnique({
				where : {
					id: executedPaymentResult.merchantInvoiceNumber
				},
				include : {
					schedule : true,
					customer : true,
					techinician : true
				}
			});

			if(!appointment){
				throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found!")
			}



			

			// total slot = 3 , available slot = 2
			// (total - available) + 1

			const alreadyBookedSlots = appointment.schedule.totalSlots - appointment.schedule.availableSlots;

			const serialNumber = alreadyBookedSlots + 1

			// 25 August => 3:00 PM - 4:00 PM
			// 1st person joining time => startDateTime = 2026-08-25T15:00:00.436Z => 3:00 PM
			// serial number (1) - 1 * 20 => 0 minues

			// 2nd person joining time => startDateTime = 2026-08-25T15:20:00.436Z => 3:00 PM
			// serial number (2) - 1 * 20 => 20 minutes


			// 3nd person joining time => startDateTime = 2026-08-25T15:40:00.436Z => 3:00 PM
			// serial number (3) - 1 * 20 => 40 mintes

			const joiningTime = addMinutes(
				appointment.schedule.startDateTime, 
				(serialNumber - 1) * 20
			)

			await tx.apppointment.update({
				where: {
					id: executedPaymentResult.merchantInvoiceNumber,
					
				},
				data: {
					status: AppointmentStatus.CONFIRMED,
					joiningTime,
					serialNumber
				},
			});

			const newAvailableSlots = appointment.schedule.availableSlots - 1;

			await prisma.schedule.update({
				where : {
					id : appointment.schedule.id
				},
				data : {
					availableSlots : newAvailableSlots
				}
			})

			await tx.payment.update({
				where: {
					appointmentId: executedPaymentResult.merchantInvoiceNumber,
					bkashPaymentId: paymentId,
				},
				data: {
					status: PaymentStatus.PAID,
					bkashTrxId: executedPaymentResult.trxID,
					paidAt: executedPaymentResult.paymentExecuteTime,
					gatewayResponse: executedPaymentResult,
				},
			});

			const pdfDocument = new PDFDocument ({ margin : 50});

			const pdfChunks : Buffer[] = []

			pdfDocument.on("data", (chunk : Buffer) => {
				pdfChunks.push(chunk)
			})

			const pdfReadyPromise = new Promise<Buffer>((resolve)=>{
				pdfDocument.on("end", () => {
					resolve(Buffer.concat(pdfChunks))
				})
			})

			pdfDocument.fontSize(20).text("PH Healthcare System", {align : "center"});
			pdfDocument.fontSize(14).text("Appointment Invoice", { align: "center" });
			pdfDocument.moveDown(2)

			pdfDocument.fontSize(12).text(`Patient Name: ${appointment.customer?.name}`);
			pdfDocument.text(`Patient Email: ${appointment.customer?.email}`);
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

			pdfDocument.end()

			const pdfBuffer = await pdfReadyPromise;

			await transporter.sendMail({
				from: config.email_sender,
				to: appointment.customer.email,
				subject: "Your Appointment Invoice - PH Healthcare System",
				text: "Thank you for booking an appointment. Please find your invoice attached.",
				attachments : [
					{
						filename: "invoice.pdf",
						content : pdfBuffer
					}
				]
			})

			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
			};
		} else if (status === "failure") {
			await tx.payment.update({
				where: {
					bkashPaymentId: paymentId,
				},
				data: {
					status: PaymentStatus.FAILED,
					gatewayResponse: executedPaymentResult,
				},
			});
			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failue`,
			};
		} else if (status === "cancel") {
			await tx.payment.update({
				where: {
					bkashPaymentId: paymentId,
				},
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
	}, {
		maxWait: 10000, // default: 2000
		timeout: 30000, // default: 5000
	});

	return transactionResult;
};



const payAppointment = async (payload: any, user: RequestUser) => {
  const appointmnetId = payload.appointmentId;
  console.log("check appoinment ID: ",appointmnetId);

  // chcecking that appontment id exist or not

  const existingAppointment = await prisma.apppointment.findUnique({
    where: {
      id: appointmnetId,
    },
  });
  if (!existingAppointment) {
    throw new Error("Appointment Does Not Exists");
  }

  if (existingAppointment.status !== "PENDING") {
    throw new Error("Appointment Is Not Pending!");
  }

  //bkash response

  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new Error("No Bkash Access Token Found!");
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
        callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
        amount: "1200",
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

const cancelAppointment = async (payload: any) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const appointmentId = payload.appointmentId;

		const existingAppointment = await tx.apppointment.findUnique({
			where: {
				id: appointmentId,
			},
			include: {
				payment: true,
			},
		});

		if (!existingAppointment) {
			throw new Error("Appointment Does Not Exists");
		}

		if (
			existingAppointment.status === "ONGOING" ||
			existingAppointment.status === "COMPLETED"
		) {
			throw new Error("Appointment Ongoing or Completed");
		}

		if (existingAppointment.status === "CANCELLED") {
			throw new Error("Appointment Already Cancelled");
		}

		const updatedAppointment = await tx.apppointment.update({
			where: {
				id: existingAppointment.id,
			},
			data: {
				status: "CANCELLED",
			},
		});

		const bkashIdToken = await getBkashIdToken();

		if (!bkashIdToken) {
			throw new Error("No Bkash Access Token Found!");
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
					reason: "customer Cancelled The Appointment",
				}),
			},
		);

		const bkashRefundPaymentResult = await bkashRefundPaymentResponse.json();

		const updatedPayment = await tx.payment.update({
			where: {
				appointmentId: existingAppointment.id,
			},
			data: {
				refundTrxId: bkashRefundPaymentResult.refundTrxID,
				refundedAt: bkashRefundPaymentResult.completedTime,
				refundAmount: bkashRefundPaymentResult.amount,
				refundReason: "customer Cancelled The Appointment",
				status: PaymentStatus.REFUNDED,
				gatewayResponse: bkashRefundPaymentResult,
			},
		});

		return {
			appointment: updatedAppointment,
			payment: updatedPayment,
		};
	});

	return transactionResult;
};

export const AppointmentServices = {
  bookAppointment,
  payAppointment,
  cancelAppointment,
  bookAppointmentCallback,
};



import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";

const bookAppointment = async () => {

    // business logic

    const bkashIdToken = await getBkashIdToken()

    if(!bkashIdToken){
        throw new Error("No Bkash Access Token Found!")
    }

    console.log({bkashIdToken});

    const bkashCreatePaymentResponse = await fetch(`${config.bkash_base_url}/tokenized/checkout/create`, {
        method : "POST",
        headers : {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: bkashIdToken,
            "X-App-Key" : config.bkash_app_key

        },
        body: JSON.stringify({
            mode: "0011",
            payerReference: "0123456789", //user email or phone number
            callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
            amount: "1200",
            currency: "BDT",
            intent: "sale",
            merchantInvoiceNumber: "Inv4" // apppointment id
        })
    });

    const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json()

    console.log({bkashCreatePaymentResult});

    return bkashCreatePaymentResult
}

const bookAppointmentCallback = async (query : Record<string, any>) => {

    const paymentId = query.paymentID

    if(!paymentId){
        throw new Error("Payment Id Missing")
    }

    const status = query.status

    if(!status){
        throw new Error("Payment Status is Missing")
    }

    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
        throw new Error("No Bkash Access Token Found!")
    }


    const executedPaymentResponse = await fetch(`${config.bkash_base_url}/tokenized/checkout/execute`, {
        method : "POST",
        headers : {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: bkashIdToken,
            "X-App-Key": config.bkash_app_key
        },

        body : JSON.stringify({
            paymentID : paymentId
        })
    })

    const executedPaymentResult = await executedPaymentResponse.json()


    if(status === "success"){
        return {
            executedPaymentResult,
            redirectUrl : `${config.frontend_url}/dashboard/my-appointments?status=success`
        }
    }
    if(status === "failure"){
        return {
            executedPaymentResult,
            redirectUrl : `${config.frontend_url}/dashboard/my-appointments?status=failue`
        }
    }
    if(status === "cancel"){
        return {
            executedPaymentResult,
            redirectUrl : `${config.frontend_url}/dashboard/my-appointments?status=cancel`
        }
    }

    return {
        executedPaymentResult,
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments`
    }
}

export const AppointmentServices = {
    bookAppointment,
    bookAppointmentCallback
}








// const initiateBookingPayment = async (bookingId: string, userId: string) => {
//   const booking = await prisma.booking.findUnique({
//     where: { id: bookingId },
//     include: { service: true, customer: true },
//   });

//   if (!booking) {
//     throw new Error("Booking not found");
//   }

//   if (booking.customerId !== userId) {
//     throw new Error("You are not authorized to pay for this booking");
//   }

//   if (booking.status !== "ACCEPTED") {
//     throw new Error("This booking is not ready for payment");
//   }

//   const bkashIdToken = await getBkashIdToken();

//   if (!bkashIdToken) {
//     throw new Error("No bKash access token found");
//   }

//   const bkashCreatePaymentResponse = await fetch(
//     `${config.bkash_base_url}/tokenized/checkout/create`,
//     {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         Accept: "application/json",
//         Authorization: bkashIdToken,
//         "X-App-Key": config.bkash_app_key,
//       },
//       body: JSON.stringify({
//         mode: "0011",
//         payerReference: booking.customer.phone ?? booking.customer.email,
//         callbackURL: `${config.bkash_callback_url}/payments/bkash/callback`,
//         amount: booking.service.price.toString(),
//         currency: "BDT",
//         intent: "sale",
//         merchantInvoiceNumber: booking.id,
//       }),
//     },
//   );

//   const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

//   return bkashCreatePaymentResult;
// };

// const handleBkashCallback = async (query: Record<string, any>) => {
//   const paymentId = query.paymentID;
//   const status = query.status;

//   if (!paymentId) {
//     throw new Error("Payment ID missing");
//   }

//   if (!status) {
//     throw new Error("Payment status missing");
//   }

//   const bkashIdToken = await getBkashIdToken();

//   if (!bkashIdToken) {
//     throw new Error("No bKash access token found");
//   }

//   const executedPaymentResponse = await fetch(
//     `${config.bkash_base_url}/tokenized/checkout/execute`,
//     {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         Accept: "application/json",
//         Authorization: bkashIdToken,
//         "X-App-Key": config.bkash_app_key,
//       },
//       body: JSON.stringify({ paymentID: paymentId }),
//     },
//   );

//   const executedPaymentResult = await executedPaymentResponse.json();

//   const bookingId = executedPaymentResult.merchantInvoiceNumber;

//   if (status === "success" && executedPaymentResult.transactionStatus === "Completed") {
//     await prisma.payment.create({
//       data: {
//         bookingId,
//         transactionId: executedPaymentResult.trxID,
//         amount: executedPaymentResult.amount,
//         provider: "BKASH",
//         status: "PAID",
//         paidAt: new Date(),
//       },
//     });

//     await prisma.booking.update({
//       where: { id: bookingId },
//       data: { status: "PAID" },
//     });

//     return {
//       executedPaymentResult,
//       redirectUrl: `${config.frontend_url}/bookings/${bookingId}?payment=success`,
//     };
//   }

//   if (status === "failure" || status === "cancel") {
//     await prisma.payment.create({
//       data: {
//         bookingId,
//         transactionId: executedPaymentResult.trxID ?? paymentId,
//         amount: executedPaymentResult.amount ?? "0",
//         provider: "BKASH",
//         status: "FAILED",
//       },
//     });

//     return {
//       executedPaymentResult,
//       redirectUrl: `${config.frontend_url}/bookings/${bookingId}?payment=${status}`,
//     };
//   }

//   return {
//     executedPaymentResult,
//     redirectUrl: `${config.frontend_url}/bookings/${bookingId}`,
//   };
// };

// export const PaymentServices = {
//   initiateBookingPayment,
//   handleBkashCallback,
// };
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

import { WEBAPP_URL } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import { handlePaymentSuccess } from "@calcom/lib/payment/handlePaymentSuccess";
import prisma from "@calcom/prisma";

const log = logger.getSubLogger({ prefix: ["payment-success-webhook"] });

const stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY || "", {
  apiVersion: "2020-08-27" as const,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id, session_id } = req.query;

  if (!session_id || !id) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  try {
    log.info("Payment success handler called", {
      sessionId: session_id,
      bookingId: id,
      query: req.query,
    });

    // First, try to find the payment to get the Stripe account ID
    const paymentRecord = await prisma.payment.findFirst({
      where: {
        bookingId: parseInt(id as string),
      },
      select: {
        data: true,
        externalId: true,
      },
    });

    log.info("Payment record lookup", {
      bookingId: parseInt(id as string),
      found: !!paymentRecord,
      externalId: paymentRecord?.externalId,
      data: paymentRecord?.data,
    });

    // Extract Stripe account from payment data if available
    const stripeAccount =
      paymentRecord?.data && typeof paymentRecord.data === "object"
        ? (paymentRecord.data as any).stripeAccount
        : undefined;

    // Retrieve the checkout session from Stripe
    const session = stripeAccount
      ? await stripe.checkout.sessions.retrieve(session_id as string, { stripeAccount })
      : await stripe.checkout.sessions.retrieve(session_id as string);

    log.info("Stripe session retrieved", {
      sessionId: session.id,
      paymentStatus: session.payment_status,
      metadata: session.metadata,
    });

    if (session.payment_status === "paid") {
      // Update payment record
      const payment = await prisma.payment.findFirst({
        where: {
          externalId: session_id as string,
          bookingId: parseInt(id as string),
        },
      });

      if (!payment) {
        // Try to find payment by just session ID to debug
        const paymentBySessionOnly = await prisma.payment.findFirst({
          where: {
            externalId: session_id as string,
          },
          select: {
            id: true,
            bookingId: true,
            externalId: true,
          },
        });

        log.error("Payment not found", {
          sessionId: session_id,
          bookingId: id,
          paymentBySessionOnly,
          parsedBookingId: parseInt(id as string),
        });
        return res.status(404).json({ error: "Payment not found" });
      }

      // Handle payment success which updates payment record and handles booking confirmation
      await handlePaymentSuccess(payment.id, payment.bookingId);

      // Get booking details for redirect
      const booking = await prisma.booking.findUnique({
        where: {
          id: parseInt(id as string),
        },
        select: {
          uid: true,
          user: {
            select: {
              locale: true,
            },
          },
        },
      });

      if (!booking) {
        log.error("Booking not found", { bookingId: id });
        return res.status(404).json({ error: "Booking not found" });
      }

      // Redirect to booking success page
      return res.redirect(`${WEBAPP_URL}/booking/${booking.uid}?payment_status=success`);
    } else {
      // Payment not successful, redirect to payment failed page
      const booking = await prisma.booking.findUnique({
        where: {
          id: parseInt(id as string),
        },
        select: {
          uid: true,
        },
      });

      if (!booking) {
        return res.redirect(`${WEBAPP_URL}/payment-failed`);
      }

      return res.redirect(`${WEBAPP_URL}/booking/${booking.uid}?payment_status=failed`);
    }
  } catch (error) {
    log.error("Payment success handler error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      sessionId: session_id,
      bookingId: id,
    });
    return res.status(500).json({
      error: "Payment verification failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

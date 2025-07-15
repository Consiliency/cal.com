import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

import { WEBAPP_URL } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";

const log = logger.getSubLogger({ prefix: ["payment-success-webhook"] });

const stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY || "", {
  apiVersion: "2020-08-27",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id, session_id } = req.query;

  if (!session_id || !id) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  try {
    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id as string);

    if (session.payment_status === "paid") {
      // Update payment record
      const payment = await prisma.payment.findFirst({
        where: {
          externalId: session_id as string,
          bookingId: parseInt(id as string),
        },
      });

      if (!payment) {
        log.error("Payment not found", { sessionId: session_id, bookingId: id });
        return res.status(404).json({ error: "Payment not found" });
      }

      await prisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          success: true,
        },
      });

      // Get booking details for confirmation
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
    log.error("Payment success handler error:", error);
    return res.status(500).json({ error: "Payment verification failed" });
  }
}

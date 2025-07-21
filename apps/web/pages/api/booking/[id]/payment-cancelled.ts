import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

import handleCancelBooking from "@calcom/features/bookings/lib/handleCancelBooking";
import { WEBAPP_URL } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";

const log = logger.getSubLogger({ prefix: ["payment-cancelled-webhook"] });

const stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY || "", {
  apiVersion: "2020-08-27" as const,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id, session_id } = req.query;

  if (!session_id || !id) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  try {
    const bookingId = parseInt(id as string);

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id as string);

    // Only proceed if the session is still open (not paid)
    if (session.status === "open") {
      try {
        // Expire the Stripe session to prevent future use
        await stripe.checkout.sessions.expire(session_id as string);
        log.info("Expired checkout session", { sessionId: session_id });
      } catch (expireError) {
        log.error("Failed to expire checkout session", expireError);
        // Continue with cancellation even if expiration fails
      }
    }

    // Get the booking details
    const booking = await prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        uid: true,
        paid: true,
        status: true,
        eventTypeId: true,
        eventType: {
          select: {
            slug: true,
            team: {
              select: {
                slug: true,
              },
            },
            owner: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    if (!booking) {
      log.error("Booking not found", { bookingId });
      return res.redirect(`${WEBAPP_URL}`);
    }

    // Only cancel if the booking is unpaid
    if (!booking.paid && booking.status !== "CANCELLED") {
      try {
        // Cancel the booking using the existing handler
        await handleCancelBooking({
          bookingData: {
            uid: booking.uid,
            cancellationReason: "Payment cancelled by user",
          },
        });

        log.info("Cancelled unpaid booking", { bookingId, uid: booking.uid });
      } catch (cancelError) {
        log.error("Failed to cancel booking", cancelError);
      }
    }

    // Redirect back to the event type page so user can try booking again
    let redirectUrl = WEBAPP_URL;

    if (booking.eventType) {
      const { slug, team, owner } = booking.eventType;
      if (team?.slug) {
        redirectUrl = `${WEBAPP_URL}/team/${team.slug}/${slug}`;
      } else if (owner?.username) {
        redirectUrl = `${WEBAPP_URL}/${owner.username}/${slug}`;
      }
    }

    return res.redirect(`${redirectUrl}?payment_cancelled=true`);
  } catch (error) {
    log.error("Payment cancellation handler error:", error);
    return res.redirect(`${WEBAPP_URL}`);
  }
}

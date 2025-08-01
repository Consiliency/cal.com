import type { Prisma } from "@prisma/client";
import { buffer } from "micro";
import type { NextApiRequest, NextApiResponse } from "next";
import type Stripe from "stripe";

import { sendAttendeeRequestEmailAndSMS, sendOrganizerRequestEmail } from "@calcom/emails";
import { doesBookingRequireConfirmation } from "@calcom/features/bookings/lib/doesBookingRequireConfirmation";
import { getAllCredentialsIncludeServiceAccountKey } from "@calcom/features/bookings/lib/getAllCredentialsForUsersOnEvent/getAllCredentials";
import { handleConfirmation } from "@calcom/features/bookings/lib/handleConfirmation";
import stripe from "@calcom/features/ee/payments/server/stripe";
import { getPlatformParams } from "@calcom/features/platform-oauth-client/get-platform-params";
import { PlatformOAuthClientRepository } from "@calcom/features/platform-oauth-client/platform-oauth-client.repository";
import EventManager, { placeholderCreatedEvent } from "@calcom/lib/EventManager";
import { IS_PRODUCTION } from "@calcom/lib/constants";
import { getErrorFromUnknown } from "@calcom/lib/errors";
import { HttpError as HttpCode } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { getBooking } from "@calcom/lib/payment/getBooking";
import { handlePaymentSuccess } from "@calcom/lib/payment/handlePaymentSuccess";
import { safeStringify } from "@calcom/lib/safeStringify";
import { prisma } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";
import { eventTypeMetaDataSchemaWithTypedApps } from "@calcom/prisma/zod-utils";

const log = logger.getSubLogger({ prefix: ["[paymentWebhook]"] });

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function handleStripePaymentSuccess(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const payment = await prisma.payment.findFirst({
    where: {
      externalId: paymentIntent.id,
    },
    select: {
      id: true,
      bookingId: true,
    },
  });

  if (!payment?.bookingId) {
    log.error("Stripe: Payment Not Found", safeStringify(paymentIntent), safeStringify(payment));
    throw new HttpCode({ statusCode: 204, message: "Payment not found" });
  }
  if (!payment?.bookingId) throw new HttpCode({ statusCode: 204, message: "Payment not found" });

  await handlePaymentSuccess(payment.id, payment.bookingId);
}

const handleSetupSuccess = async (event: Stripe.Event) => {
  const setupIntent = event.data.object as Stripe.SetupIntent;
  const payment = await prisma.payment.findFirst({
    where: {
      externalId: setupIntent.id,
    },
  });

  if (!payment?.data || !payment?.id) throw new HttpCode({ statusCode: 204, message: "Payment not found" });

  const { booking, user, evt, eventType } = await getBooking(payment.bookingId);

  const bookingData: Prisma.BookingUpdateInput = {
    paid: true,
  };

  if (!user) throw new HttpCode({ statusCode: 204, message: "No user found" });

  const requiresConfirmation = doesBookingRequireConfirmation({
    booking: {
      ...booking,
      eventType,
    },
  });

  const metadata = eventTypeMetaDataSchemaWithTypedApps.parse(eventType?.metadata);
  const allCredentials = await getAllCredentialsIncludeServiceAccountKey(user, {
    ...booking.eventType,
    metadata,
  });

  const platformOAuthClientRepository = new PlatformOAuthClientRepository();
  const platformOAuthClient = user.isPlatformManaged
    ? await platformOAuthClientRepository.getByUserId(user.id)
    : null;
  const areCalendarEventsEnabled = platformOAuthClient?.areCalendarEventsEnabled ?? true;
  const areEmailsEnabled = platformOAuthClient?.areEmailsEnabled ?? true;

  if (!requiresConfirmation) {
    const eventManager = new EventManager({ ...user, credentials: allCredentials }, metadata?.apps);
    const scheduleResult = areCalendarEventsEnabled
      ? await eventManager.create(evt)
      : placeholderCreatedEvent;
    bookingData.references = { create: scheduleResult.referencesToCreate };
    bookingData.status = BookingStatus.ACCEPTED;
  }

  await prisma.payment.update({
    where: {
      id: payment.id,
    },
    data: {
      data: {
        ...(payment.data as Prisma.JsonObject),
        setupIntent: setupIntent as unknown as Prisma.JsonObject,
      },
      booking: {
        update: {
          ...bookingData,
        },
      },
    },
  });

  // If the card information was already captured in the same customer. Delete the previous payment method

  if (!requiresConfirmation) {
    await handleConfirmation({
      user: { ...user, credentials: allCredentials },
      evt,
      prisma,
      bookingId: booking.id,
      booking,
      paid: true,
      platformClientParams: platformOAuthClient ? getPlatformParams(platformOAuthClient) : undefined,
    });
  } else if (areEmailsEnabled) {
    await sendOrganizerRequestEmail({ ...evt }, eventType.metadata);
    await sendAttendeeRequestEmailAndSMS({ ...evt }, evt.attendees[0], eventType.metadata);
  }
};

const handlePaymentFailed = async (event: Stripe.Event) => {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const payment = await prisma.payment.findFirst({
    where: {
      externalId: paymentIntent.id,
    },
    select: {
      id: true,
      bookingId: true,
      paymentOption: true,
    },
  });

  if (!payment?.bookingId) {
    log.info("Payment not found for failed payment intent", { paymentIntentId: paymentIntent.id });
    return;
  }

  // Only auto-cancel for SYNC_BOOKING payments
  if (payment.paymentOption !== "SYNC_BOOKING") {
    log.info("Payment failed but not SYNC_BOOKING, skipping auto-cancellation", {
      paymentId: payment.id,
      paymentOption: payment.paymentOption,
    });
    return;
  }

  // Cancel the booking
  await prisma.booking.update({
    where: {
      id: payment.bookingId,
    },
    data: {
      status: BookingStatus.CANCELLED,
      cancellationReason: "Payment failed",
    },
  });

  log.info("Cancelled booking due to payment failure", {
    bookingId: payment.bookingId,
    paymentId: payment.id,
  });
};

const handleCheckoutSessionExpired = async (event: Stripe.Event) => {
  const session = event.data.object as Stripe.Checkout.Session;

  // For checkout sessions, we need to find the payment by the session ID
  const payment = await prisma.payment.findFirst({
    where: {
      OR: [{ externalId: session.id }, { data: { path: ["sessionId"], equals: session.id } }],
    },
    select: {
      id: true,
      bookingId: true,
      paymentOption: true,
    },
  });

  if (!payment?.bookingId) {
    log.info("Payment not found for expired checkout session", { sessionId: session.id });
    return;
  }

  // Only auto-cancel for SYNC_BOOKING payments
  if (payment.paymentOption !== "SYNC_BOOKING") {
    log.info("Checkout session expired but not SYNC_BOOKING, skipping auto-cancellation", {
      paymentId: payment.id,
      paymentOption: payment.paymentOption,
    });
    return;
  }

  // Cancel the booking
  await prisma.booking.update({
    where: {
      id: payment.bookingId,
    },
    data: {
      status: BookingStatus.CANCELLED,
      cancellationReason: "Payment session expired",
    },
  });

  log.info("Cancelled booking due to checkout session expiration", {
    bookingId: payment.bookingId,
    paymentId: payment.id,
  });
};

type WebhookHandler = (event: Stripe.Event) => Promise<void>;

const webhookHandlers: Record<string, WebhookHandler | undefined> = {
  "payment_intent.succeeded": handleStripePaymentSuccess,
  "setup_intent.succeeded": handleSetupSuccess,
  "payment_intent.payment_failed": handlePaymentFailed,
  "checkout.session.expired": handleCheckoutSessionExpired,
};

/**
 * @deprecated
 * We need to create a PaymentManager in `@calcom/lib`
 * to prevent circular dependencies on App Store migration
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      throw new HttpCode({ statusCode: 405, message: "Method Not Allowed" });
    }
    const sig = req.headers["stripe-signature"];
    if (!sig) {
      throw new HttpCode({ statusCode: 400, message: "Missing stripe-signature" });
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new HttpCode({ statusCode: 500, message: "Missing process.env.STRIPE_WEBHOOK_SECRET" });
    }
    const requestBuffer = await buffer(req);
    const payload = requestBuffer.toString();

    const event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);

    // bypassing this validation for e2e tests
    // in order to successfully confirm the payment
    if (!event.account && !process.env.NEXT_PUBLIC_IS_E2E) {
      throw new HttpCode({ statusCode: 202, message: "Incoming connected account" });
    }

    const handler = webhookHandlers[event.type];
    if (handler) {
      await handler(event);
    } else {
      /** Not really an error, just letting Stripe know that the webhook was received but unhandled */
      throw new HttpCode({
        statusCode: 202,
        message: `Unhandled Stripe Webhook event type ${event.type}`,
      });
    }
  } catch (_err) {
    const err = getErrorFromUnknown(_err);
    console.error(`Webhook Error: ${err.message}`);
    res.status(err.statusCode ?? 500).send({
      message: err.message,
      stack: IS_PRODUCTION ? undefined : err.stack,
    });
    return;
  }

  // Return a response to acknowledge receipt of the event
  res.json({ received: true });
}

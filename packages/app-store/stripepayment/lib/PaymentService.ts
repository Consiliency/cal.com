import type { Booking, Payment, PaymentOption, Prisma } from "@prisma/client";
import Stripe from "stripe";
import { v4 as uuidv4 } from "uuid";
import z from "zod";

import { sendAwaitingPaymentEmailAndSMS } from "@calcom/emails";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { getErrorFromUnknown } from "@calcom/lib/errors";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import prisma from "@calcom/prisma";
import type { EventTypeMetadata } from "@calcom/prisma/zod-utils";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { IAbstractPaymentService } from "@calcom/types/PaymentService";

import { paymentOptionEnum } from "../zod";
import { createPaymentLink } from "./client";
import { retrieveOrCreateStripeCustomerByEmail } from "./customer";
import type { StripePaymentData, StripeSetupIntentData } from "./server";

const log = logger.getSubLogger({ prefix: ["payment-service:stripe"] });

export const stripeCredentialKeysSchema = z.object({
  stripe_user_id: z.string(),
  default_currency: z.string(),
  stripe_publishable_key: z.string(),
});

const stripeAppKeysSchema = z.object({
  client_id: z.string(),
  payment_fee_fixed: z.number(),
  payment_fee_percentage: z.number(),
});

export class PaymentService implements IAbstractPaymentService {
  private stripe: Stripe;
  private credentials: z.infer<typeof stripeCredentialKeysSchema> | null;

  constructor(credentials: { key: Prisma.JsonValue }) {
    const keyParsing = stripeCredentialKeysSchema.safeParse(credentials.key);
    if (keyParsing.success) {
      this.credentials = keyParsing.data;
    } else {
      this.credentials = null;
    }
    this.stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY || "", {
      apiVersion: "2023-10-16",
    });
  }

  private async getPayment(where: Prisma.PaymentWhereInput) {
    const payment = await prisma.payment.findFirst({ where });
    if (!payment) throw new Error("Payment not found");
    if (!payment.externalId) throw new Error("Payment externalId not found");
    return { ...payment, externalId: payment.externalId };
  }

  /* This method is for creating charges at the time of booking */
  async create(
    payment: Pick<Prisma.PaymentUncheckedCreateInput, "amount" | "currency">,
    bookingId: Booking["id"],
    userId: Booking["userId"],
    username: string | null,
    bookerName: string,
    paymentOption: PaymentOption,
    bookerEmail: string,
    bookerPhoneNumber?: string | null,
    eventTitle?: string,
    bookingTitle?: string
  ) {
    try {
      // Ensure that the payment service can support the passed payment option
      if (paymentOptionEnum.parse(paymentOption) !== "ON_BOOKING") {
        throw new Error("Payment option is not compatible with create method");
      }

      if (!this.credentials) {
        throw new Error("Stripe credentials not found");
      }

      const customer = await retrieveOrCreateStripeCustomerByEmail(
        this.credentials.stripe_user_id,
        bookerEmail,
        bookerPhoneNumber
      );

      // Get booking details to check for Stripe metadata
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: {
          eventType: {
            select: {
              metadata: true,
            },
          },
        },
      });

      let stripePriceId: string | undefined;
      if (booking?.eventType?.metadata && typeof booking.eventType.metadata === "object") {
        const metadata = booking.eventType.metadata as any;
        stripePriceId = metadata?.apps?.stripe?.stripePriceId;
      }

      // Create Embedded Checkout Session instead of Payment Intent
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: "payment",
          // @ts-expect-error - ui_mode is available in newer Stripe versions
          ui_mode: "embedded",
          customer: customer.id,
          line_items: [
            stripePriceId
              ? {
                  price: stripePriceId,
                  quantity: 1,
                }
              : {
                  price_data: {
                    currency: payment.currency,
                    product_data: {
                      name: eventTitle || bookingTitle || "Booking",
                    },
                    unit_amount: payment.amount,
                  },
                  quantity: 1,
                },
          ],
          allow_promotion_codes: true,
          return_url: `${WEBAPP_URL}/api/booking/${bookingId}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${WEBAPP_URL}/api/booking/${bookingId}/payment-cancelled?session_id={CHECKOUT_SESSION_ID}`,
          metadata: {
            identifier: "cal.com",
            bookingId: bookingId.toString(),
            calAccountId: userId ? userId.toString() : "",
            calUsername: username || "",
            bookerName,
            bookerEmail,
            bookerPhoneNumber: bookerPhoneNumber || "",
            eventTitle: eventTitle || "",
            bookingTitle: bookingTitle || "",
          },
        },
        {
          stripeAccount: this.credentials.stripe_user_id,
        }
      );

      const paymentData = await prisma.payment.create({
        data: {
          uid: uuidv4(),
          app: {
            connect: {
              slug: "stripe",
            },
          },
          booking: {
            connect: {
              id: bookingId,
            },
          },
          amount: payment.amount,
          currency: payment.currency,
          externalId: session.id,
          data: {
            sessionId: session.id,
            clientSecret: (session as any).client_secret,
            stripe_publishable_key: this.credentials.stripe_publishable_key,
            stripeAccount: this.credentials.stripe_user_id,
          } as Prisma.InputJsonValue,
          fee: 0,
          refunded: false,
          success: false,
          paymentOption: paymentOption || "ON_BOOKING",
        },
      });
      if (!paymentData) {
        throw new Error();
      }
      return paymentData;
    } catch (error) {
      log.error("Stripe: Payment could not be created", bookingId, safeStringify(error));
      throw new Error("payment_not_created_error");
    }
  }

  async collectCard(
    payment: Pick<Prisma.PaymentUncheckedCreateInput, "amount" | "currency">,
    bookingId: Booking["id"],
    paymentOption: PaymentOption,
    bookerEmail: string,
    bookerPhoneNumber?: string | null
  ): Promise<Payment> {
    try {
      if (!this.credentials) {
        throw new Error("Stripe credentials not found");
      }

      // Ensure that the payment service can support the passed payment option
      if (paymentOptionEnum.parse(paymentOption) !== "HOLD") {
        throw new Error("Payment option is not compatible with create method");
      }

      const customer = await retrieveOrCreateStripeCustomerByEmail(
        this.credentials.stripe_user_id,
        bookerEmail,
        bookerPhoneNumber
      );

      const params = {
        customer: customer.id,
        payment_method_types: ["card"],
        metadata: {
          bookingId,
          bookerPhoneNumber: bookerPhoneNumber ?? null,
        },
      };

      const setupIntent = await this.stripe.setupIntents.create(params, {
        stripeAccount: this.credentials.stripe_user_id,
      });

      const paymentData = await prisma.payment.create({
        data: {
          uid: uuidv4(),
          app: {
            connect: {
              slug: "stripe",
            },
          },
          booking: {
            connect: {
              id: bookingId,
            },
          },
          amount: payment.amount,
          currency: payment.currency,
          externalId: setupIntent.id,
          data: Object.assign(
            {},
            {
              setupIntent,
              stripe_publishable_key: this.credentials.stripe_publishable_key,
              stripeAccount: this.credentials.stripe_user_id,
            }
          ) as unknown as Prisma.InputJsonValue,
          fee: 0,
          refunded: false,
          success: false,
          paymentOption: paymentOption || "ON_BOOKING",
        },
      });

      return paymentData;
    } catch (error) {
      log.error(
        "Stripe: Payment method could not be collected for bookingId",
        bookingId,
        safeStringify(error)
      );
      throw new Error("Stripe: Payment method could not be collected");
    }
  }

  async chargeCard(payment: Payment, _bookingId?: Booking["id"]): Promise<Payment> {
    try {
      if (!this.credentials) {
        throw new Error("Stripe credentials not found");
      }

      const stripeAppKeys = await prisma.app.findFirst({
        select: {
          keys: true,
        },
        where: {
          slug: "stripe",
        },
      });

      const paymentObject = payment.data as unknown as StripeSetupIntentData;

      const setupIntent = paymentObject.setupIntent;

      // Parse keys with zod
      const { payment_fee_fixed, payment_fee_percentage } = stripeAppKeysSchema.parse(stripeAppKeys?.keys);

      const paymentFee = Math.round(payment.amount * payment_fee_percentage + payment_fee_fixed);

      // Ensure that the stripe customer & payment method still exists
      const customer = await this.stripe.customers.retrieve(setupIntent.customer as string, {
        stripeAccount: this.credentials.stripe_user_id,
      });
      const paymentMethod = await this.stripe.paymentMethods.retrieve(setupIntent.payment_method as string, {
        stripeAccount: this.credentials.stripe_user_id,
      });

      if (!customer) {
        throw new Error(`Stripe customer does not exist for setupIntent ${setupIntent.id}`);
      }

      if (!paymentMethod) {
        throw new Error(`Stripe paymentMethod does not exist for setupIntent ${setupIntent.id}`);
      }

      const params: Stripe.PaymentIntentCreateParams = {
        amount: payment.amount,
        currency: payment.currency,
        application_fee_amount: paymentFee,
        customer: setupIntent.customer as string,
        payment_method: setupIntent.payment_method as string,
        off_session: true,
        confirm: true,
      };

      const paymentIntent = await this.stripe.paymentIntents.create(params, {
        stripeAccount: this.credentials.stripe_user_id,
      });

      const paymentData = await prisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          success: true,
          data: {
            ...paymentObject,
            paymentIntent,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      if (!paymentData) {
        throw new Error();
      }

      return paymentData;
    } catch (error) {
      log.error("Stripe: Could not charge card for payment", _bookingId, safeStringify(error));
      throw new Error(ErrorCode.ChargeCardFailure);
    }
  }

  async update(): Promise<Payment> {
    throw new Error("Method not implemented.");
  }

  async refund(paymentId: Payment["id"]): Promise<Payment> {
    try {
      const payment = await this.getPayment({
        id: paymentId,
        success: true,
        refunded: false,
      });

      const stripeAccount = (payment.data as unknown as StripePaymentData)["stripeAccount"];

      // For checkout sessions, we need to get the payment intent ID first
      const session = await this.stripe.checkout.sessions.retrieve(payment.externalId, { stripeAccount });

      if (!session.payment_intent) {
        throw new Error("No payment intent found for session");
      }

      const refund = await this.stripe.refunds.create(
        {
          payment_intent: session.payment_intent as string,
        },
        { stripeAccount }
      );

      if (!refund || refund.status === "failed") {
        throw new Error("Refund failed");
      }

      const updatedPayment = await prisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          refunded: true,
        },
      });
      return updatedPayment;
    } catch (e) {
      const err = getErrorFromUnknown(e);
      throw err;
    }
  }

  async afterPayment(
    event: CalendarEvent,
    booking: {
      user: { email: string | null; name: string | null; timeZone: string } | null;
      id: number;
      startTime: { toISOString: () => string };
      uid: string;
    },
    paymentData: Payment,
    eventTypeMetadata?: EventTypeMetadata
  ): Promise<void> {
    await sendAwaitingPaymentEmailAndSMS(
      {
        ...event,
        paymentInfo: {
          link: createPaymentLink({
            paymentUid: paymentData.uid,
            name: booking.user?.name,
            email: booking.user?.email,
            date: booking.startTime.toISOString(),
          }),
          paymentOption: paymentData.paymentOption || "ON_BOOKING",
          amount: paymentData.amount,
          currency: paymentData.currency,
        },
      },
      eventTypeMetadata
    );
  }

  async deletePayment(paymentId: Payment["id"]): Promise<boolean> {
    try {
      const payment = await this.getPayment({
        id: paymentId,
      });
      const stripeAccount = (payment.data as unknown as StripePaymentData).stripeAccount;

      if (!stripeAccount) {
        throw new Error("Stripe account not found");
      }

      // For checkout sessions, we need to expire the session
      try {
        await this.stripe.checkout.sessions.expire(payment.externalId, { stripeAccount });
      } catch (e) {
        // If it's already expired or completed, that's fine
        log.info("Session may already be expired or completed", payment.externalId);
      }

      return true;
    } catch (e) {
      log.error("Stripe: Unable to delete Payment in stripe of paymentId", paymentId, safeStringify(e));
      return false;
    }
  }

  getPaymentPaidStatus(): Promise<string> {
    throw new Error("Method not implemented.");
  }

  getPaymentDetails(): Promise<Payment> {
    throw new Error("Method not implemented.");
  }

  isSetupAlready(): boolean {
    return !!this.credentials;
  }
}

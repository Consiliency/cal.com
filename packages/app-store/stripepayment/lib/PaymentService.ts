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
  stripe_user_id: z.string().optional(),
  default_currency: z.string(),
  stripe_publishable_key: z.string(),
  // For platform accounts using manual configuration
  platform_secret_key: z.string().optional(),
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
    
    // Use platform secret key if available (manual configuration), otherwise use env variable
    const stripeApiKey = this.credentials?.platform_secret_key || process.env.STRIPE_PRIVATE_KEY || "";
    
    this.stripe = new Stripe(stripeApiKey, {
      apiVersion: "2025-06-30.basil",
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
      log.info("PaymentService.create called", {
        bookingId,
        userId,
        amount: payment.amount,
        currency: payment.currency,
        paymentOption,
        hasCredentials: !!this.credentials,
        hasStripeUserId: !!this.credentials?.stripe_user_id,
        hasPlatformSecretKey: !!this.credentials?.platform_secret_key,
        bookerEmail,
      });

      // Ensure that the payment service can support the passed payment option
      const parsedOption = paymentOptionEnum.parse(paymentOption);
      if (parsedOption !== "ON_BOOKING" && parsedOption !== "SYNC_BOOKING") {
        throw new Error("Payment option is not compatible with create method");
      }

      if (!this.credentials) {
        throw new Error("Stripe credentials not found");
      }

      // Log Stripe configuration
      log.info("Stripe configuration", {
        hasStripeUserId: !!this.credentials.stripe_user_id,
        hasPlatformSecretKey: !!this.credentials.platform_secret_key,
        hasPublishableKey: !!this.credentials.stripe_publishable_key,
        currency: this.credentials.default_currency,
        stripeApiKeyLength: (this.stripe as any)._api?.auth?.length || 0,
      });

      // For platform accounts, pass undefined as stripeAccountId
      log.info("Retrieving or creating Stripe customer", {
        stripeAccountId: this.credentials.stripe_user_id || "platform",
        bookerEmail,
      });

      const customer = await retrieveOrCreateStripeCustomerByEmail(
        this.credentials.stripe_user_id || "",
        bookerEmail,
        bookerPhoneNumber
      );

      log.info("Stripe customer retrieved/created", {
        customerId: customer.id,
        email: customer.email,
      });

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

      // Log session creation parameters
      log.info("Creating Stripe checkout session", {
        mode: "payment",
        ui_mode: "embedded",
        customerId: customer.id,
        stripePriceId,
        amount: payment.amount,
        currency: payment.currency,
        stripeAccount: this.credentials.stripe_user_id,
        hasStripePriceId: !!stripePriceId,
        eventTitle: eventTitle || bookingTitle || "Booking",
      });

      // Create Embedded Checkout Session instead of Payment Intent
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
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
        // cancel_url is not supported with ui_mode: "embedded"
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
      };

      // Only pass stripeAccount for connected accounts, not for platform accounts
      const stripeOptions = this.credentials.stripe_user_id 
        ? { stripeAccount: this.credentials.stripe_user_id }
        : undefined;

      // Create payment record first with a unique ID
      const paymentUid = uuidv4();
      
      log.info("Creating payment record", {
        paymentUid,
        bookingId,
        amount: payment.amount,
        currency: payment.currency,
      });

      // Create payment record with pending status
      const paymentData = await prisma.payment.create({
        data: {
          uid: paymentUid,
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
          externalId: "", // Will be updated after session creation
          data: {
            status: "pending",
            stripe_publishable_key: this.credentials.stripe_publishable_key,
            stripeAccount: this.credentials.stripe_user_id || null,
          } as Prisma.InputJsonValue,
          fee: 0,
          refunded: false,
          success: false,
          paymentOption: paymentOption || "ON_BOOKING",
        },
      });

      log.info("Payment record created", {
        paymentId: paymentData.id,
        paymentUid: paymentData.uid,
      });

      try {
        log.info("Creating Stripe checkout session with params", {
          sessionParams: JSON.stringify(sessionParams),
          stripeOptions: JSON.stringify(stripeOptions),
        });

        const session = await this.stripe.checkout.sessions.create(sessionParams, stripeOptions);

        log.info("Stripe checkout session created successfully", {
          sessionId: session.id,
          clientSecret: !!(session as any).client_secret,
          url: session.url,
        });

        // Update payment record with session details
        const updatedPayment = await prisma.payment.update({
          where: { id: paymentData.id },
          data: {
            externalId: session.id,
            data: {
              sessionId: session.id,
              client_secret: (session as any).client_secret || "",
              stripe_publishable_key: this.credentials.stripe_publishable_key,
              stripeAccount: this.credentials.stripe_user_id || null,
              status: "session_created",
            } as Prisma.InputJsonValue,
          },
        });

        return updatedPayment;
      } catch (sessionError) {
        log.error("Failed to create Stripe session, but payment record exists", {
          paymentId: paymentData.id,
          paymentUid: paymentData.uid,
          error: sessionError,
        });
        
        // Update payment record with error status
        await prisma.payment.update({
          where: { id: paymentData.id },
          data: {
            data: {
              ...(paymentData.data as object),
              status: "session_creation_failed",
              error: sessionError instanceof Error ? sessionError.message : String(sessionError),
            } as Prisma.InputJsonValue,
          },
        });

        // Re-throw to maintain existing error flow, but payment record exists
        throw sessionError;
      }
    } catch (error) {
      // Enhanced error logging
      const errorDetails = {
        bookingId,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCode: (error as any)?.code,
        errorType_stripe: (error as any)?.type,
        stripeRequestId: (error as any)?.requestId,
        statusCode: (error as any)?.statusCode,
        rawError: safeStringify(error),
        credentials: {
          hasStripeUserId: !!this.credentials?.stripe_user_id,
          hasPublishableKey: !!this.credentials?.stripe_publishable_key,
          currency: this.credentials?.default_currency,
        },
        sessionData: {
          amount: payment.amount,
          currency: payment.currency,
          bookerEmail,
          eventTitle,
        },
      };

      log.error("Stripe: Payment creation failed with detailed error", errorDetails);

      // Throw more specific error if it's a Stripe error
      if ((error as any)?.code === "account_invalid") {
        throw new Error("Stripe account configuration error");
      }
      if ((error as any)?.code === "parameter_invalid_empty") {
        throw new Error("Missing required Stripe parameters");
      }

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

      // For platform accounts, pass undefined as stripeAccountId
      const customer = await retrieveOrCreateStripeCustomerByEmail(
        this.credentials.stripe_user_id || "",
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

      // Only pass stripeAccount for connected accounts
      const stripeOptions = this.credentials.stripe_user_id 
        ? { stripeAccount: this.credentials.stripe_user_id }
        : undefined;
      
      const setupIntent = await this.stripe.setupIntents.create(params, stripeOptions);

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
              stripeAccount: this.credentials.stripe_user_id || null,
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
      const stripeRetrieveOptions = this.credentials.stripe_user_id 
        ? { stripeAccount: this.credentials.stripe_user_id }
        : undefined;
        
      const customer = await this.stripe.customers.retrieve(setupIntent.customer as string, stripeRetrieveOptions);
      const paymentMethod = await this.stripe.paymentMethods.retrieve(setupIntent.payment_method as string, stripeRetrieveOptions);

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

      const paymentIntentOptions = this.credentials.stripe_user_id 
        ? { stripeAccount: this.credentials.stripe_user_id }
        : undefined;
        
      const paymentIntent = await this.stripe.paymentIntents.create(params, paymentIntentOptions);

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
      const sessionOptions = stripeAccount ? { stripeAccount } : undefined;
      const session = await this.stripe.checkout.sessions.retrieve(payment.externalId, sessionOptions);

      if (!session.payment_intent) {
        throw new Error("No payment intent found for session");
      }

      const refund = await this.stripe.refunds.create(
        {
          payment_intent: session.payment_intent as string,
        },
        sessionOptions
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
    // Only send payment link email for ON_BOOKING option
    // SYNC_BOOKING payments are handled synchronously, no email needed
    // HOLD payments don't need immediate payment emails
    if (paymentData.paymentOption === "ON_BOOKING") {
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
  }

  async deletePayment(paymentId: Payment["id"]): Promise<boolean> {
    try {
      const payment = await this.getPayment({
        id: paymentId,
      });
      const stripeAccount = (payment.data as unknown as StripePaymentData).stripeAccount;

      // For checkout sessions, we need to expire the session
      try {
        const expireOptions = stripeAccount ? { stripeAccount } : undefined;
        await this.stripe.checkout.sessions.expire(payment.externalId, expireOptions);
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

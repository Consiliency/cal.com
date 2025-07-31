import { z } from "zod";

import { RefundPolicy } from "@calcom/lib/payment/types";

import { eventTypeAppCardZod } from "../eventTypeAppCardZod";
import { paymentOptions } from "./lib/constants";

// Extract the payment options enum from paymentOptions
// https://stackoverflow.com/a/73825370
type PaymentOption = (typeof paymentOptions)[number]["value"];
const VALUES: [PaymentOption, ...PaymentOption[]] = [
  paymentOptions[0].value,
  ...paymentOptions.slice(1).map((option) => option.value),
];
export const paymentOptionEnum = z.enum(VALUES);

export const appDataSchema = eventTypeAppCardZod.merge(
  z.object({
    price: z.number(),
    currency: z.string(),
    paymentOption: paymentOptionEnum.optional(),
    enabled: z.boolean().optional(),
    refundPolicy: z.nativeEnum(RefundPolicy).optional(),
    refundDaysCount: z.number().optional(),
    refundCountCalendarDays: z.boolean().optional(),
  })
);

export const appKeysSchema = z.object({
  // OAuth Client ID - only required for Stripe Connect apps, not for platform accounts
  client_id: z.union([z.string().startsWith("ca_").min(1), z.literal("")]).optional(),
  // Secret key (despite the name, this is your Stripe secret key)
  client_secret: z.string().startsWith("sk_").min(1),
  // Publishable key
  public_key: z.string().startsWith("pk_").min(1),
  // Webhook signing secret
  webhook_secret: z.string().startsWith("whsec_").min(1),
});

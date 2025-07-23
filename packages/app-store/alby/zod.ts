import { z } from "zod";

import { eventTypeAppCardZod } from "@calcom/app-store/eventTypeAppCardZod";

const paymentOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const paymentOptionsSchema = z.array(paymentOptionSchema);

export const AlbyPaymentOptions = [
  {
    label: "on_booking_option",
    value: "ON_BOOKING",
  },
  {
    label: "sync_booking_option",
    value: "SYNC_BOOKING",
  },
];

type PaymentOption = (typeof AlbyPaymentOptions)[number]["value"];
const VALUES: [PaymentOption, ...PaymentOption[]] = [
  AlbyPaymentOptions[0].value,
  ...AlbyPaymentOptions.slice(1).map((option) => option.value),
];
export const paymentOptionEnum = z.enum(VALUES);

export const appDataSchema = eventTypeAppCardZod.merge(
  z.object({
    price: z.number(),
    currency: z.string(),
    paymentOption: z.string().optional(),
    enabled: z.boolean().optional(),
    credentialId: z.number().optional(),
  })
);
export const appKeysSchema = z.object({
  client_id: z.string(),
  client_secret: z.string(),
});

import { z } from "zod";

import { eventTypeAppCardZod } from "@calcom/app-store/eventTypeAppCardZod";

export const HitPayPaymentOptions = [
  {
    label: "on_booking_option",
    value: "ON_BOOKING",
  },
  {
    label: "sync_booking_option",
    value: "SYNC_BOOKING",
  },
];

type PaymentOption = (typeof HitPayPaymentOptions)[number]["value"];
const VALUES: [PaymentOption, ...PaymentOption[]] = [
  HitPayPaymentOptions[0].value,
  ...HitPayPaymentOptions.slice(1).map((option) => option.value),
];
export const paymentOptionEnum = z.enum(VALUES);

export const appDataSchema = eventTypeAppCardZod.merge(
  z.object({
    price: z.number(),
    currency: z.string(),
    paymentOption: z.string().optional(),
    enabled: z.boolean().optional(),
  })
);
export const appKeysSchema = z.object({});

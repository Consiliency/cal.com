import type { Payment } from "@calcom/prisma/client";

function hasStringProp<T extends string>(x: unknown, key: T): x is { [key in T]: string } {
  return !!x && typeof x === "object" && key in x;
}

export function getClientSecretFromPayment(
  payment: Omit<Partial<Payment>, "data"> & { data: Record<string, unknown> }
) {
  let clientSecret = "";

  if (
    payment.paymentOption === "HOLD" &&
    hasStringProp(payment.data, "setupIntent") &&
    hasStringProp(payment.data.setupIntent, "client_secret")
  ) {
    clientSecret = payment.data.setupIntent.client_secret;
  } else if (hasStringProp(payment.data, "client_secret")) {
    clientSecret = payment.data.client_secret;
  }

  // Decode client secret if it contains URL-encoded characters
  if (clientSecret && clientSecret.includes("%")) {
    try {
      return decodeURIComponent(clientSecret);
    } catch (e) {
      // If decoding fails, return as-is
      return clientSecret;
    }
  }

  return clientSecret;
}

"use client";

import type { EventType, Payment } from "@prisma/client";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useState } from "react";

import getStripe from "@calcom/app-store/stripepayment/lib/client";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { CheckboxField } from "@calcom/ui/components/form";

import type { PaymentPageProps } from "../pages/payment";

export type Props = {
  payment: Omit<Payment, "id" | "fee" | "success" | "refunded" | "externalId" | "data"> & {
    data: Record<string, unknown>;
  };
  eventType: {
    id: number;
    successRedirectUrl: EventType["successRedirectUrl"];
    forwardParamsSuccessRedirect: EventType["forwardParamsSuccessRedirect"];
  };
  user: {
    username: string | null;
  };
  location?: string | null;
  clientSecret: string;
  booking: PaymentPageProps["booking"];
};

const PaymentFormWithHoldAcknowledgment = (props: Props) => {
  const { t } = useLocale();
  const paymentOption = props.payment.paymentOption;
  const [holdAcknowledged, setHoldAcknowledged] = useState<boolean>(paymentOption === "HOLD" ? false : true);

  // If HOLD payment and not acknowledged, show acknowledgment form
  if (paymentOption === "HOLD" && !holdAcknowledged) {
    return (
      <div className="bg-subtle mt-4 rounded-md p-6">
        <div className="bg-info mb-5 rounded-md p-3">
          <CheckboxField
            description={t("acknowledge_booking_no_show_fee", {
              amount: props.payment.amount / 100,
              formatParams: { amount: { currency: props.payment.currency } },
            })}
            onChange={(e) => setHoldAcknowledged(e.target.checked)}
            descriptionClassName="text-info font-semibold"
          />
        </div>
      </div>
    );
  }

  // Once acknowledged (or if not HOLD), show embedded checkout
  return <EmbeddedCheckout />;
};

export const PaymentForm = (props: Props) => {
  const stripe = getStripe(props.payment.data.stripe_publishable_key as string);
  const { i18n } = useLocale();

  // Configure appearance and locale for embedded checkout
  const options = {
    clientSecret: props.clientSecret,
    appearance: {
      theme: "stripe" as const,
    },
    locale: i18n.language as any,
  };

  // If connected account, we need to pass it differently for embedded checkout
  if (props.payment.data.stripeAccount) {
    // For connected accounts, the stripe instance needs to be initialized with stripeAccount
    const stripeWithAccount = getStripe(
      props.payment.data.stripe_publishable_key as string,
      props.payment.data.stripeAccount as string
    );
    return (
      <EmbeddedCheckoutProvider stripe={stripeWithAccount} options={options}>
        <PaymentFormWithHoldAcknowledgment {...props} />
      </EmbeddedCheckoutProvider>
    );
  }

  return (
    <EmbeddedCheckoutProvider stripe={stripe} options={options}>
      <PaymentFormWithHoldAcknowledgment {...props} />
    </EmbeddedCheckoutProvider>
  );
};

export default PaymentForm;

"use client";

import type { EventType, Payment } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import getStripe from "@calcom/app-store/stripepayment/lib/client";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
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

const CheckoutRedirectForm = (props: Props) => {
  const { t } = useLocale();
  const router = useRouter();
  const paymentOption = props.payment.paymentOption;
  const [holdAcknowledged, setHoldAcknowledged] = useState<boolean>(paymentOption === "HOLD" ? false : true);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleCheckoutRedirect = async () => {
    if (!props.clientSecret) return;

    setIsRedirecting(true);
    const stripe = await getStripe(props.payment.data.stripe_publishable_key as string);
    if (!stripe) {
      console.error("Stripe failed to load");
      setIsRedirecting(false);
      return;
    }

    // Redirect to Stripe Checkout
    const { error } = await stripe.redirectToCheckout({
      sessionId: props.payment.data.sessionId as string,
    });

    if (error) {
      console.error("Stripe redirect error:", error);
      setIsRedirecting(false);
    }
  };

  return (
    <div className="bg-subtle mt-4 rounded-md p-6">
      {paymentOption === "HOLD" && (
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
      )}
      <div className="mt-4 flex justify-end space-x-2">
        <Button color="minimal" onClick={() => router.back()} disabled={isRedirecting}>
          {t("cancel")}
        </Button>
        <Button
          onClick={handleCheckoutRedirect}
          disabled={!holdAcknowledged || isRedirecting}
          loading={isRedirecting}>
          {paymentOption === "HOLD"
            ? t("submit_card_info")
            : t("pay_now", {
                amount: props.payment.amount / 100,
                formatParams: { amount: { currency: props.payment.currency } },
              })}
        </Button>
      </div>
    </div>
  );
};

export const PaymentForm = (props: Props) => {
  // For now, use redirect approach until we can update to a version with EmbeddedCheckout
  return <CheckoutRedirectForm {...props} />;
};

export default PaymentForm;

import { useRouter } from "next/navigation";
import { useState } from "react";

import getStripe from "@calcom/app-store/stripepayment/lib/client";
import type { Props } from "@calcom/features/ee/payments/components/Payment";
import type { PaymentPageProps } from "@calcom/features/ee/payments/pages/payment";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { CheckboxField } from "@calcom/ui/components/form";

const StripePaymentComponent = (
  props: Props & {
    onPaymentSuccess?: (input: PaymentPageProps) => void;
    onPaymentCancellation?: (input: PaymentPageProps) => void;
  }
) => {
  const { t } = useLocale();
  const router = useRouter();
  const paymentOption = props.payment.paymentOption;
  const [holdAcknowledged, setHoldAcknowledged] = useState<boolean>(paymentOption === "HOLD" ? false : true);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleCheckoutRedirect = async () => {
    if (!props.clientSecret) return;

    setIsRedirecting(true);
    const stripe = await getStripe(
      props.payment.data.stripe_publishable_key as string,
      props.payment.data.stripeAccount as string
    );

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
        <Button
          color="minimal"
          onClick={() => props.onPaymentCancellation?.(props as unknown as PaymentPageProps)}
          disabled={isRedirecting}>
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

const StripePaymentForm = (
  props: Props & {
    uid: string;
    onPaymentSuccess?: (input: PaymentPageProps) => void;
    onPaymentCancellation?: (input: PaymentPageProps) => void;
  }
) => {
  // Use the redirect component directly
  return <StripePaymentComponent {...props} />;
};

export default StripePaymentForm;

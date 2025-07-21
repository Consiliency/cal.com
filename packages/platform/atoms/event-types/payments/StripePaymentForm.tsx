import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useEffect, useState } from "react";

import getStripe from "@calcom/app-store/stripepayment/lib/client";
import type { Props } from "@calcom/features/ee/payments/components/Payment";
import type { PaymentPageProps } from "@calcom/features/ee/payments/pages/payment";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { CheckboxField } from "@calcom/ui/components/form";

const StripePaymentComponent = (
  props: Props & {
    onPaymentSuccess?: (input: PaymentPageProps) => void;
    onPaymentCancellation?: (input: PaymentPageProps) => void;
  }
) => {
  const { t } = useLocale();
  const paymentOption = props.payment.paymentOption;
  const [holdAcknowledged, setHoldAcknowledged] = useState<boolean>(paymentOption === "HOLD" ? false : true);

  // Set up callback handling for embedded checkout
  useEffect(() => {
    // Embedded checkout handles its own success/error states
    // The success callback will be triggered by the redirect URL
    // which is handled by the payment-success API endpoint
  }, []);

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

const StripePaymentForm = (
  props: Props & {
    uid: string;
    onPaymentSuccess?: (input: PaymentPageProps) => void;
    onPaymentCancellation?: (input: PaymentPageProps) => void;
  }
) => {
  const { i18n } = useLocale();
  const [theme, setTheme] = useState<"stripe" | "night">("stripe");

  useEffect(() => {
    if (document.documentElement.classList.contains("dark")) {
      setTheme("night");
    }
  }, []);

  // Configure options for embedded checkout
  const options = {
    clientSecret: props.clientSecret,
    appearance: {
      theme,
    },
    locale: i18n.language as any,
  };

  // Handle connected accounts
  const stripe = props.payment.data.stripeAccount
    ? getStripe(
        props.payment.data.stripe_publishable_key as string,
        props.payment.data.stripeAccount as string
      )
    : getStripe(props.payment.data.stripe_publishable_key as string);

  return (
    <EmbeddedCheckoutProvider stripe={stripe} options={options}>
      <StripePaymentComponent {...props} />
    </EmbeddedCheckoutProvider>
  );
};

export default StripePaymentForm;

"use client";

import type { EventType, Payment } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

const EmbeddedCheckoutForm = (props: Props) => {
  const { t } = useLocale();
  const router = useRouter();
  const checkoutRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const paymentOption = props.payment.paymentOption;
  const [holdAcknowledged, setHoldAcknowledged] = useState<boolean>(paymentOption === "HOLD" ? false : true);

  useEffect(() => {
    if (!props.clientSecret || !holdAcknowledged) return;

    const initializeEmbeddedCheckout = async () => {
      try {
        const stripe = await getStripe(props.payment.data.stripe_publishable_key as string);
        if (!stripe) {
          setError(t("stripe_load_error"));
          setIsLoading(false);
          return;
        }

        const checkout = await stripe.initEmbeddedCheckout({
          clientSecret: props.clientSecret,
          onComplete: async () => {
            // Payment completed successfully
            // The actual confirmation is handled by the return_url (payment-success endpoint)
            setIsLoading(true);
          },
        });

        if (checkoutRef.current) {
          checkout.mount(checkoutRef.current);
          setIsLoading(false);
        }

        // Cleanup function
        return () => {
          checkout.destroy();
        };
      } catch (err) {
        console.error("Error initializing embedded checkout:", err);
        setError(t("payment_initialization_error"));
        setIsLoading(false);
      }
    };

    initializeEmbeddedCheckout();
  }, [props.clientSecret, props.payment.data.stripe_publishable_key, holdAcknowledged, t]);

  if (error) {
    return (
      <div className="bg-subtle mt-4 rounded-md p-6">
        <div className="text-error mb-4">{error}</div>
        <div className="mt-4 flex justify-end space-x-2">
          <Button color="minimal" onClick={() => router.back()}>
            {t("go_back")}
          </Button>
          <Button onClick={() => window.location.reload()}>{t("retry")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-subtle mt-4 rounded-md p-6">
      {paymentOption === "HOLD" && !holdAcknowledged && (
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
      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="text-muted">{t("loading_payment_form")}</div>
        </div>
      )}
      <div ref={checkoutRef} id="stripe-embedded-checkout" className={isLoading ? "hidden" : ""} />
    </div>
  );
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
  // Use embedded checkout for SYNC_BOOKING and ON_BOOKING with embedded support
  if (
    props.clientSecret &&
    (props.payment.paymentOption === "SYNC_BOOKING" || props.payment.paymentOption === "ON_BOOKING")
  ) {
    return <EmbeddedCheckoutForm {...props} />;
  }
  // Fall back to redirect approach for older payment flows
  return <CheckoutRedirectForm {...props} />;
};

export default PaymentForm;

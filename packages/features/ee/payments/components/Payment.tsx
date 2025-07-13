"use client";

import type { EventType, Payment } from "@prisma/client";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { StripeElementLocale, StripeElements, StripePaymentElementOptions } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import type { SyntheticEvent } from "react";
import { useEffect, useState } from "react";

import getStripe from "@calcom/app-store/stripepayment/lib/client";
import { useBookingSuccessRedirect } from "@calcom/lib/bookingSuccessRedirect";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { PaymentOption } from "@calcom/prisma/enums";
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

export type States =
  | {
      status: "idle";
    }
  | {
      status: "processing";
    }
  | {
      status: "error";
      error: Error;
    }
  | {
      status: "ok";
    };

export const PaymentFormComponent = (
  props: Props & {
    onSubmit: (ev: SyntheticEvent) => void;
    onCancel: () => void;
    onPaymentElementChange: () => void;
    elements: StripeElements | null;
    paymentOption: PaymentOption | null;
    state: States;
  }
) => {
  const { t, i18n } = useLocale();
  const { paymentOption, elements, state, onPaymentElementChange } = props;
  const [isCanceling, setIsCanceling] = useState<boolean>(false);
  const [holdAcknowledged, setHoldAcknowledged] = useState<boolean>(paymentOption === "HOLD" ? false : true);
  const disableButtons = isCanceling || !holdAcknowledged || ["processing", "error"].includes(state.status);

  const paymentElementOptions = {
    layout: "accordion",
  } as StripePaymentElementOptions;

  useEffect(() => {
    elements?.update({ locale: i18n.language as StripeElementLocale });
  }, [elements, i18n.language]);

  return (
    <form id="payment-form" className="bg-subtle mt-4 rounded-md p-6" onSubmit={props.onSubmit}>
      <div>
        <PaymentElement options={paymentElementOptions} onChange={(_) => onPaymentElementChange()} />
      </div>
      {paymentOption === "HOLD" && (
        <div className="bg-info mb-5 mt-2 rounded-md p-3">
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
      <div className="mt-2 flex justify-end space-x-2">
        <Button
          color="minimal"
          disabled={disableButtons}
          id="cancel"
          type="button"
          loading={isCanceling}
          onClick={() => {
            setIsCanceling(true);
            props.onCancel();
          }}>
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          form="payment-form"
          disabled={disableButtons}
          loading={state.status === "processing"}>
          {paymentOption === "HOLD"
            ? t("submit_card_info")
            : t("pay_now", {
                amount: props.payment.amount / 100,
                formatParams: { amount: { currency: props.payment.currency } },
              })}
        </Button>
      </div>
      {state.status === "error" && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-xs text-red-800" role="alert">
          {state.error.message}
        </div>
      )}
    </form>
  );
};

export const PaymentForm = (props: Props) => {
  const router = useRouter();
  const searchParams = useCompatSearchParams();
  const [state, setState] = useState<States>({ status: "idle" });
  const stripe = useStripe();
  const elements = useElements();
  const paymentOption = props.payment.paymentOption;
  const [isValid, setIsValid] = useState<boolean>(false);
  const bookingSuccessRedirect = useBookingSuccessRedirect();

  const onCancel = () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (parent.location.hostname === "app.cal.com" && parent?.window?.close) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return parent.window.close();
    }
    return router.back();
  };

  const handleSubmit = async (ev: SyntheticEvent) => {
    ev.preventDefault();

    if (!stripe || !elements || !isValid) return;

    setState({ status: "processing" });

    let payload;
    const params: {
      uid: string;
      email: string | null;
      location?: string;
    } = {
      uid: props.booking.uid,
      email: searchParams?.get("email"),
    };

    if (props.location) {
      if (props.location.includes("integration")) {
        params.location = t("web_conferencing_details_to_follow");
      } else {
        params.location = props.location;
      }
    }

    if (paymentOption === "HOLD" && "setupIntent" in props.payment.data) {
      payload = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${WEBAPP_URL}/booking/${props.booking.uid}`,
        },
      });
    } else if (paymentOption === "ON_BOOKING") {
      payload = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: bookingSuccessRedirect({
            successRedirectUrl: props.eventType.successRedirectUrl,
            query: params,
            booking: props.booking,
            forwardParamsSuccessRedirect: props.eventType.forwardParamsSuccessRedirect,
          }),
        },
      });
    }

    // @ts-expect-error payload is inferred as unknown
    if (payload?.error) {
      setState({
        status: "error",
        // @ts-expect-error payload is inferred as unknown
        error: new Error(payload.error.message),
      });
    } else {
      setState({ status: "ok" });
    }
  };

  const { t } = useLocale();

  return (
    <Elements
      options={{
        clientSecret: props.clientSecret,
        stripeAccount: props.payment.data.stripeAccount as string,
      }}
      stripe={getStripe(props.payment.data.stripe_publishable_key as string)}>
      <PaymentFormComponent
        {...props}
        paymentOption={paymentOption}
        onSubmit={handleSubmit}
        onCancel={onCancel}
        onPaymentElementChange={() => setIsValid(true)}
        elements={elements}
        state={state}
      />
    </Elements>
  );
};

export default PaymentForm;

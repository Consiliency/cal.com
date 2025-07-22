import { useEffect, useRef, useState } from "react";

import getStripe from "@calcom/app-store/stripepayment/lib/client";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button, Dialog, DialogContent } from "@calcom/ui";

interface InlinePaymentProps {
  clientSecret: string;
  stripePublishableKey: string;
  onSuccess: () => void;
  onCancel: () => void;
  isOpen: boolean;
}

export function InlinePayment({
  clientSecret,
  stripePublishableKey,
  onSuccess,
  onCancel,
  isOpen,
}: InlinePaymentProps) {
  const { t } = useLocale();
  const checkoutRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const checkoutInstanceRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    if (!isOpen || !clientSecret || !stripePublishableKey) return;

    const initializeEmbeddedCheckout = async () => {
      try {
        const stripe = await getStripe(stripePublishableKey);
        if (!stripe) {
          setError(t("stripe_load_error"));
          setIsLoading(false);
          return;
        }

        const checkout = await stripe.initEmbeddedCheckout({
          clientSecret,
          onComplete: async () => {
            // Payment completed successfully
            setIsLoading(true);
            onSuccess();
          },
        });

        checkoutInstanceRef.current = checkout;

        if (checkoutRef.current) {
          checkout.mount(checkoutRef.current);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Error initializing embedded checkout:", err);
        setError(t("payment_initialization_error"));
        setIsLoading(false);
      }
    };

    initializeEmbeddedCheckout();

    // Cleanup function
    return () => {
      if (checkoutInstanceRef.current) {
        checkoutInstanceRef.current.destroy();
        checkoutInstanceRef.current = null;
      }
    };
  }, [clientSecret, stripePublishableKey, isOpen, onSuccess, t]);

  if (error) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
        <DialogContent className="sm:max-w-[600px]">
          <div className="p-6">
            <div className="text-error mb-4">{error}</div>
            <div className="mt-4 flex justify-end space-x-2">
              <Button color="minimal" onClick={onCancel}>
                {t("cancel")}
              </Button>
              <Button onClick={() => window.location.reload()}>{t("retry")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[600px]">
        <div className="p-6">
          <h2 className="text-default mb-4 text-lg font-semibold">{t("complete_payment")}</h2>
          {isLoading && (
            <div className="flex justify-center py-8">
              <div className="text-muted">{t("loading_payment_form")}</div>
            </div>
          )}
          <div ref={checkoutRef} id="stripe-embedded-checkout-inline" className={isLoading ? "hidden" : ""} />
          {!isLoading && (
            <div className="mt-4 flex justify-end">
              <Button color="minimal" onClick={onCancel}>
                {t("cancel")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

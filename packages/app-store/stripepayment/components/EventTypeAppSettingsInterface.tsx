import * as RadioGroup from "@radix-ui/react-radio-group";
import { useState, useEffect } from "react";

import type { EventTypeAppSettingsComponent } from "@calcom/app-store/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { RefundPolicy } from "@calcom/lib/payment/types";
import classNames from "@calcom/ui/classNames";
import { Alert } from "@calcom/ui/components/alert";
import { Select } from "@calcom/ui/components/form";
import { TextField } from "@calcom/ui/components/form";
import { RadioField } from "@calcom/ui/components/radio";

import {
  convertToSmallestCurrencyUnit,
  convertFromSmallestToPresentableCurrencyUnit,
} from "../../_utils/payments/currencyConversions";
import { paymentOptions } from "../lib/constants";
import { currencyOptions } from "../lib/currencyOptions";

type Option = { value: string; label: string };

type StripeProduct = {
  id: string;
  name: string;
  description: string | null;
  prices: {
    id: string;
    currency: string;
    unit_amount: number | null;
    nickname: string | null;
    recurring: {
      interval: string;
      interval_count: number;
    } | null;
  }[];
};

const EventTypeAppSettingsInterface: EventTypeAppSettingsComponent = ({
  getAppData,
  setAppData,
  disabled,
  eventType,
}) => {
  const price = getAppData("price");
  const currency = getAppData("currency") || currencyOptions[0].value;
  const [selectedCurrency, setSelectedCurrency] = useState(
    currencyOptions.find((c) => c.value === currency) || {
      label: currencyOptions[0].label,
      value: currencyOptions[0].value,
    }
  );

  // Check and clear invalid credentialId on mount
  // This handles cases where credentialId is stored but the credential doesn't exist
  useEffect(() => {
    const storedCredentialId = getAppData("credentialId");
    if (storedCredentialId) {
      console.log("Found stored credentialId, clearing it for manual configuration:", storedCredentialId);
      // Clear the invalid credentialId to allow manual configuration to work
      setAppData("credentialId", undefined);
    }
  }, []); // Run only on mount

  const paymentOption = getAppData("paymentOption");
  const paymentOptionSelectValue = paymentOptions.find((option) => paymentOption === option.value);
  const requirePayment = getAppData("enabled");
  const getSelectedOption = () =>
    options.find((opt) => opt.value === (getAppData("refundCountCalendarDays") === true ? 1 : 0));

  // New state for product selection
  const pricingMode = getAppData("pricingMode") || "custom_price";
  const [stripeProducts, setStripeProducts] = useState<StripeProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const selectedProductId = getAppData("stripeProductId");
  const selectedPriceId = getAppData("stripePriceId");

  const { t } = useLocale();
  const recurringEventDefined = eventType.recurringEvent?.count !== undefined;
  const seatsEnabled = !!eventType.seatsPerTimeSlot;
  const getCurrencySymbol = (locale: string, currency: string) =>
    (0)
      .toLocaleString(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
      .replace(/\d/g, "")
      .trim();

  // Fetch Stripe products
  const fetchStripeProducts = async (usePlatformAccount = false) => {
    // Debug: Check if cookies are accessible
    if (typeof document !== "undefined") {
      console.log("Document cookies available:", document.cookie.length > 0 ? "Yes" : "No");
    }
    setLoadingProducts(true);
    setProductError(null);
    try {
      const params = new URLSearchParams();

      // Only get and append credentialId if NOT using platform account
      // When using platform account or manual configuration, we don't need credentialId
      if (!usePlatformAccount) {
        const credentialId = getAppData("credentialId");
        // Only append if it exists and is not undefined
        if (credentialId && credentialId !== undefined) {
          params.append("credentialId", credentialId.toString());
        }
      } else {
        // When using platform account, ensure we don't send credentialId
        console.log("Using platform account - skipping credentialId");
      }

      // Add debug flag to get more info
      params.append("debug", "true");

      // Add platform account flag if needed
      if (usePlatformAccount) {
        params.append("usePlatformAccount", "true");
      }

      const url = `/api/integrations/stripe/products${params.toString() ? `?${params.toString()}` : ""}`;
      console.log("Fetching Stripe products from:", url);
      
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        console.error("Stripe products fetch failed:", response.status, response.statusText);
        const error = await response.json();
        console.error("Error details:", error);
        throw new Error(error.error || "Failed to fetch products");
      }
      const data = await response.json();

      // Log debug info if available
      if (data.debug) {
        console.log("Stripe Products Debug Info:", data.debug);

        // If no products found in connected account, suggest trying platform account
        if (
          data.debug.results.formattedProductsCount === 0 &&
          !usePlatformAccount &&
          data.debug.accounts.isUsingConnectedAccount
        ) {
          console.log(
            "No products found in connected account. Try fetching from platform account by calling: fetchStripeProducts(true)"
          );
        }
      }

      setStripeProducts(data.products || []);
    } catch (error) {
      console.error("Error fetching Stripe products:", error);
      setProductError(error instanceof Error ? error.message : "Failed to fetch products");
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    if (requirePayment) {
      if (!getAppData("currency")) {
        setAppData("currency", currencyOptions[0].value);
      }
      if (!getAppData("paymentOption")) {
        setAppData("paymentOption", paymentOptions[0].value);
      }
      // Fetch products when payment is enabled and pricing mode is stripe_product
      if (pricingMode === "stripe_product") {
        // Check if we have a stored credentialId that might be invalid
        const storedCredentialId = getAppData("credentialId");
        if (storedCredentialId) {
          console.log("Found credentialId on initial load, using platform account mode");
          // Use platform account mode to bypass invalid credentialId
          fetchStripeProducts(true);
        } else {
          fetchStripeProducts();
        }
      }
    }

    if (!getAppData("refundPolicy")) {
      setAppData("refundPolicy", RefundPolicy.NEVER);
    }
  }, [requirePayment, getAppData, setAppData, pricingMode]);

  // Expose fetchStripeProducts to window for debugging
  useEffect(() => {
    if (typeof window !== "undefined" && pricingMode === "stripe_product") {
      (window as any).fetchStripeProducts = fetchStripeProducts;
      console.log("Debug: You can now call window.fetchStripeProducts(true) to fetch from platform account");
    }

    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).fetchStripeProducts;
      }
    };
  }, [pricingMode]);

  const options = [
    { value: 0, label: t("business_days") },
    { value: 1, label: t("calendar_days") },
  ];
  return (
    <>
      {recurringEventDefined && (
        <Alert className="mt-2" severity="warning" title={t("warning_recurring_event_payment")} />
      )}
      {!recurringEventDefined && requirePayment && (
        <>
          {/* Pricing Mode Selection */}
          <div className="mt-4">
            <label className="text-default mb-2 block text-sm font-medium">{t("pricing_type")}</label>
            <RadioGroup.Root
              defaultValue={pricingMode}
              value={pricingMode}
              onValueChange={(val) => {
                setAppData("pricingMode", val);
                // Clear product selection when switching to custom price
                if (val === "custom_price") {
                  setAppData("stripeProductId", undefined);
                  setAppData("stripePriceId", undefined);
                }
              }}
              className="flex flex-col space-y-2">
              <RadioField
                label={t("use_stripe_product")}
                value="stripe_product"
                id="stripe_product"
                disabled={disabled}
              />
              <RadioField
                label={t("custom_price")}
                value="custom_price"
                id="custom_price"
                disabled={disabled}
              />
            </RadioGroup.Root>
          </div>

          {/* Stripe Product Selection */}
          {pricingMode === "stripe_product" && (
            <div className="mt-4">
              <label className="text-default mb-1 block text-sm font-medium">
                {t("select_stripe_product")}
              </label>
              {loadingProducts && <div className="text-sm text-gray-500">{t("loading_products")}</div>}
              {productError && (
                <Alert severity="error" title={t("error_loading_products")} message={productError} />
              )}
              {!loadingProducts && !productError && (
                <Select<{
                  value: string;
                  label: string;
                  product: StripeProduct;
                  price: StripeProduct["prices"][0];
                }>
                  isSearchable
                  placeholder={t("select_product")}
                  options={stripeProducts.flatMap((product) =>
                    product.prices.map((price) => ({
                      value: `${product.id}|${price.id}`,
                      label: `${product.name} - ${
                        price.unit_amount
                          ? new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: price.currency.toUpperCase(),
                            }).format(price.unit_amount / 100)
                          : "Variable"
                      }${price.recurring ? ` / ${price.recurring.interval}` : ""}`,
                      product,
                      price,
                    }))
                  )}
                  value={
                    selectedProductId && selectedPriceId
                      ? stripeProducts
                          .flatMap((product) =>
                            product.prices.map((price) => ({
                              value: `${product.id}|${price.id}`,
                              label: `${product.name} - ${
                                price.unit_amount
                                  ? new Intl.NumberFormat("en-US", {
                                      style: "currency",
                                      currency: price.currency.toUpperCase(),
                                    }).format(price.unit_amount / 100)
                                  : "Variable"
                              }${price.recurring ? ` / ${price.recurring.interval}` : ""}`,
                              product,
                              price,
                            }))
                          )
                          .find((opt) => opt.value === `${selectedProductId}|${selectedPriceId}`)
                      : undefined
                  }
                  onChange={(selected) => {
                    if (selected) {
                      const [productId, priceId] = selected.value.split("|");
                      setAppData("stripeProductId", productId);
                      setAppData("stripePriceId", priceId);
                      // Update currency from the selected price
                      if (selected.price) {
                        setAppData("currency", selected.price.currency.toUpperCase());
                        if (selected.price.unit_amount) {
                          setAppData("price", selected.price.unit_amount);
                        }
                      }
                    }
                  }}
                  isDisabled={disabled || loadingProducts || !!productError}
                  className="w-full"
                />
              )}
              {stripeProducts.length === 0 && !loadingProducts && !productError && (
                <p className="mt-2 text-sm text-gray-500">
                  {t("no_products_found")}{" "}
                  <a
                    href="https://dashboard.stripe.com/products"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline">
                    {t("create_in_stripe")}
                  </a>
                </p>
              )}
            </div>
          )}

          {/* Custom Price Fields - Only show when custom_price is selected */}
          {pricingMode === "custom_price" && (
            <div className="mt-4 block items-center justify-start sm:flex sm:space-x-2">
              <TextField
                data-testid="stripe-price-input"
                label={t("price")}
                className="h-[38px]"
                addOnLeading={
                  <>{selectedCurrency.value ? getCurrencySymbol("en", selectedCurrency.value) : ""}</>
                }
                addOnSuffix={currency.toUpperCase()}
                addOnClassname="h-[38px]"
                step="0.01"
                min="0.5"
                type="number"
                required
                placeholder="Price"
                disabled={disabled}
                onChange={(e) => {
                  setAppData("price", convertToSmallestCurrencyUnit(Number(e.target.value), currency));
                }}
                value={price > 0 ? convertFromSmallestToPresentableCurrencyUnit(price, currency) : undefined}
              />
            </div>
          )}

          {/* Currency Selector - Show for custom price mode */}
          {pricingMode === "custom_price" && (
            <div className="mt-5 w-60">
              <label className="text-default mb-1 block text-sm font-medium" htmlFor="currency">
                {t("currency")}
              </label>
              <Select
                data-testid="stripe-currency-select"
                variant="default"
                options={currencyOptions}
                innerClassNames={{
                  input: "stripe-currency-input",
                }}
                value={selectedCurrency}
                className="text-black"
                defaultValue={selectedCurrency}
                onChange={(e) => {
                  if (e) {
                    setSelectedCurrency(e);
                    setAppData("currency", e.value);
                  }
                }}
              />
            </div>
          )}

          {/* Payment Option - Show for both modes */}
          <div className="mt-4 w-60">
            <label className="text-default mb-1 block text-sm font-medium" htmlFor="currency">
              {t("payment_option")}
            </label>
            <Select<Option>
              data-testid="stripe-payment-option-select"
              defaultValue={
                paymentOptionSelectValue
                  ? { ...paymentOptionSelectValue, label: t(paymentOptionSelectValue.label) }
                  : { ...paymentOptions[0], label: t(paymentOptions[0].label) }
              }
              options={paymentOptions.map((option) => {
                return { ...option, label: t(option.label) || option.label };
              })}
              onChange={(input) => {
                if (input) {
                  setAppData("paymentOption", input.value);
                  if (input.value === "HOLD") {
                    setAppData("refundPolicy", RefundPolicy.NEVER);
                    setAppData("refundDaysCount", undefined);
                    setAppData("refundCountCalendarDays", undefined);
                  }
                }
              }}
              className="mb-1 h-[38px] w-full"
              isDisabled={seatsEnabled || disabled}
            />
          </div>

          {seatsEnabled && paymentOption === "HOLD" && (
            <Alert className="mt-2" severity="warning" title={t("seats_and_no_show_fee_error")} />
          )}

          {paymentOption !== "HOLD" && (
            <div className="mt-4 w-full">
              <label className="text-default mb-1 block text-sm font-medium">{t("refund_policy")}</label>
              <RadioGroup.Root
                disabled={disabled || paymentOption === "HOLD"}
                defaultValue="never"
                className="flex flex-col space-y-2"
                value={getAppData("refundPolicy")}
                onValueChange={(val) => {
                  setAppData("refundPolicy", val);
                  if (val !== RefundPolicy.DAYS) {
                    setAppData("refundDaysCount", undefined);
                    setAppData("refundCountCalendarDays", undefined);
                  }
                }}>
                <RadioField className="w-fit" value={RefundPolicy.ALWAYS} label={t("always")} id="always" />
                <RadioField className="w-fit" value={RefundPolicy.NEVER} label={t("never")} id="never" />
                <div className={classNames("text-default mb-2 flex flex-wrap items-center text-sm")}>
                  <RadioGroup.Item
                    className="min-w-4 bg-default border-default flex h-4 w-4 cursor-pointer items-center rounded-full border focus:border-2 focus:outline-none ltr:mr-2 rtl:ml-2"
                    value="days"
                    id="days">
                    <RadioGroup.Indicator className="after:bg-inverted relative flex h-4 w-4 items-center justify-center after:block after:h-2 after:w-2 after:rounded-full" />
                  </RadioGroup.Item>
                  <div className="flex items-center">
                    <span className="me-2 ms-2">&nbsp;{t("if_cancelled")}</span>
                    <TextField
                      labelSrOnly
                      type="number"
                      className={classNames(
                        "border-default my-0 block w-16 text-sm [appearance:textfield] ltr:mr-2 rtl:ml-2"
                      )}
                      placeholder="2"
                      disabled={disabled}
                      min={0}
                      defaultValue={getAppData("refundDaysCount")}
                      required={getAppData("refundPolicy") === RefundPolicy.DAYS}
                      value={getAppData("refundDaysCount") ?? ""}
                      onChange={(e) => setAppData("refundDaysCount", parseInt(e.currentTarget.value))}
                    />
                    <Select
                      options={options}
                      isSearchable={false}
                      isDisabled={disabled}
                      onChange={(option) => setAppData("refundCountCalendarDays", option?.value === 1)}
                      value={getSelectedOption()}
                      defaultValue={getSelectedOption()}
                    />
                    <span className="me-2 ms-2">&nbsp;{t("before")}</span>
                  </div>
                </div>
              </RadioGroup.Root>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default EventTypeAppSettingsInterface;

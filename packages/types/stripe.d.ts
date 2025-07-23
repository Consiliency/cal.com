import "stripe";

declare module "stripe" {
  namespace Stripe {
    namespace Checkout {
      interface SessionCreateParams {
        ui_mode?: "embedded" | "hosted";
      }
    }
  }
}

export interface ChargeRequest {
  amount: number; // in the base currency unit (e.g. rupees), not paise/cents
  currency: string;
  billId: string;
  description: string;
}

export interface ChargeResult {
  status: "SUCCESS" | "FAILED" | "PENDING";
  providerRefId: string;
  receiptUrl?: string;
}

export interface PaymentProvider {
  name: string;
  charge(req: ChargeRequest): Promise<ChargeResult>;
}

/**
 * Mock provider used out of the box so the app runs with zero external
 * credentials. Swap for RazorpayProvider/StripeProvider once API keys are
 * available — the rest of the app only depends on the PaymentProvider
 * interface above.
 */
export const mockProvider: PaymentProvider = {
  name: "mock",
  async charge(req) {
    await new Promise((r) => setTimeout(r, 150));
    return {
      status: "SUCCESS",
      providerRefId: `mock_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
      receiptUrl: undefined,
    };
  },
};

/**
 * Real integration placeholder. Wire up `razorpay` npm package and
 * RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET env vars, then handle the
 * webhook at POST /payments/webhook/razorpay to confirm the charge.
 */
export const razorpayProvider: PaymentProvider = {
  name: "razorpay",
  async charge() {
    throw new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET and implement this provider, or use 'mock' in the meantime."
    );
  },
};

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  async charge() {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY and implement this provider, or use 'mock' in the meantime."
    );
  },
};

export function getProvider(name: string): PaymentProvider {
  switch (name) {
    case "razorpay":
      return razorpayProvider;
    case "stripe":
      return stripeProvider;
    default:
      return mockProvider;
  }
}

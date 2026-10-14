import { websiteConfig } from '@/config/website';
import { CreemProvider } from './provider/creem';
import { DodoProvider } from './provider/dodo';
import { PaypalProvider } from './provider/paypal';
import { StripeProvider } from './provider/stripe';
import { WaffoProvider } from './provider/waffo';
import type {
  CheckoutResult,
  CreateCheckoutParams,
  CreateCreditCheckoutParams,
  CreatePortalParams,
  PaymentProvider,
  PaymentProviderName,
  PortalResult,
} from './types';

type PaymentProviderFactory = () => PaymentProvider;

const providerRegistry: Partial<
  Record<PaymentProviderName, PaymentProviderFactory>
> = {
  stripe: () => new StripeProvider(),
  creem: () => new CreemProvider(),
  paypal: () => new PaypalProvider(),
  waffo: () => new WaffoProvider(),
  dodo: () => new DodoProvider(),
};

let paymentProvider: PaymentProvider | null = null;

function createPaymentProvider(): PaymentProvider {
  const name = websiteConfig.payment.provider;
  if (!name) throw new Error('payment.provider is required in websiteConfig.');
  const factory = providerRegistry[name];
  if (!factory) throw new Error(`Unsupported payment provider: ${name}.`);
  return factory();
}

/**
 * Get the payment provider
 * @returns current payment provider instance
 * @throws Error if provider is not initialized
 */
export const getPaymentProvider = (): PaymentProvider => {
  if (!paymentProvider) paymentProvider = createPaymentProvider();
  return paymentProvider;
};

/**
 * Create a checkout session for a plan
 * @param params Parameters for creating the checkout session
 * @returns Checkout result
 */
export const createCheckout = async (
  params: CreateCheckoutParams
): Promise<CheckoutResult> => {
  const provider = getPaymentProvider();
  return provider.createCheckout(params);
};

/**
 * Create a checkout session for a credit package
 * @param params Parameters for creating the checkout session
 * @returns Checkout result
 */
export const createCreditCheckout = async (
  params: CreateCreditCheckoutParams
): Promise<CheckoutResult> => {
  const provider = getPaymentProvider();
  return provider.createCreditCheckout(params);
};

/**
 * Create a customer portal session
 * @param params Parameters for creating the portal
 * @returns Portal result
 */
export const createCustomerPortal = async (
  params: CreatePortalParams,
  providerName?: PaymentProviderName
): Promise<PortalResult> => {
  const provider = providerName
    ? providerRegistry[providerName]?.()
    : getPaymentProvider();
  if (!provider)
    throw new Error(`Unsupported payment provider: ${providerName}.`);
  return provider.createCustomerPortal(params);
};

/**
 * Handle webhook event
 * @param payload Raw webhook payload
 * @param signature Webhook signature
 */
export const handleWebhookEvent = async (
  payload: string,
  signature: string,
  providerName: PaymentProviderName,
  headers?: Headers
): Promise<void> => {
  const factory = providerRegistry[providerName];
  if (!factory)
    throw new Error(`Unsupported payment provider: ${providerName}.`);
  await factory().handleWebhookEvent(payload, signature, headers);
};

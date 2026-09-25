import { websiteConfig } from '@/config/website';
import { findPaymentPriceKey } from '@/config/website';
import type { Price, PricePlan } from '@/payment/types';

/**
 * Get all price plans (without translations, like name/description/features)
 * NOTICE: This function can be used in server or client components.
 * @returns Array of price plans
 */
export const getAllPricePlans = (): PricePlan[] => {
  return Object.values(websiteConfig.price.plans);
};

/**
 * Get plan by plan ID
 * @param planId Plan ID
 * @returns Plan or undefined if not found
 */
export const findPlanByPlanId = (planId: string): PricePlan | undefined => {
  return getAllPricePlans().find((plan) => plan.id === planId);
};

/**
 * Find plan by price ID
 * @param priceId Price ID (Stripe price ID)
 * @returns Plan or undefined if not found
 */
export const findPlanByPriceId = (priceId: string): PricePlan | undefined => {
  const plans = getAllPricePlans();
  for (const plan of plans) {
    const matchingPrice = plan.prices.find(
      (price) => price.priceId === priceId
    );
    if (matchingPrice) {
      return plan;
    }
  }
  const key = findPaymentPriceKey(priceId)?.key;
  if (key === 'lifetime') return plans.find((plan) => plan.isLifetime);
  if (key === 'proMonthly' || key === 'proYearly') {
    return plans.find((plan) => plan.id === 'pro');
  }
  return undefined;
};

export const findConfiguredPriceById = (priceId: string): Price | undefined => {
  const key = findPaymentPriceKey(priceId)?.key;
  if (key === 'proMonthly') return websiteConfig.price.plans.pro.prices[0];
  if (key === 'proYearly') return websiteConfig.price.plans.pro.prices[1];
  if (key === 'lifetime') return websiteConfig.price.plans.lifetime.prices[0];
  return getAllPricePlans()
    .flatMap((plan) => plan.prices)
    .find((price) => price.priceId === priceId);
};

/**
 * Find price in a plan by ID
 * @param planId Plan ID
 * @param priceId Price ID (Stripe price ID)
 * @returns Price or undefined if not found
 */
export const findPriceInPlan = (
  planId: string,
  priceId: string
): Price | undefined => {
  const plan = findPlanByPlanId(planId);
  if (!plan) {
    console.error(`findPriceInPlan, Plan with ID ${planId} not found`);
    return undefined;
  }
  return plan.prices.find((price) => price.priceId === priceId);
};

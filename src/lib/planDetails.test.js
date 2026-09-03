import { describe, expect, it } from 'vitest';
import { getSubscriptionState, normalizePlanDetails } from './planDetails';

describe('subscription state', () => {
  it('marks a salon with a past expiry date as expired', () => {
    const plan = normalizePlanDetails({
      planType: 'monthly',
      planExpiryDate: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(plan.expired).toBe(true);
    expect(getSubscriptionState({ planType: 'monthly', planExpiryDate: plan.expiryDate }).expired).toBe(true);
  });

  it('supports nested subscription status values', () => {
    expect(getSubscriptionState({ planType: 'quarterly', subscription: { status: 'EXPIRED' } }).expired).toBe(true);
    expect(getSubscriptionState({ planType: 'quarterly', subscription: { status: 'ACTIVE' } }).active).toBe(true);
  });

  it('lets an explicit active flag win over a stale cached expiry date', () => {
    const plan = normalizePlanDetails({
      planType: 'monthly',
      planExpiryDate: new Date(Date.now() - 60_000).toISOString(),
      subscriptionExpired: false,
    });

    expect(plan.expired).toBe(false);
    expect(plan.isActive).toBe(true);
  });

  it('does not infer subscription state from the salon account status', () => {
    const state = getSubscriptionState({ planType: 'monthly', status: 'CLOSED' });
    expect(state.known).toBe(false);
    expect(state.expired).toBe(false);
  });
});

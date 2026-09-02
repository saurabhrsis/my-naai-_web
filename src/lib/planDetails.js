// Subscription plan catalog and helpers for showing the active plan.
// Ids, titles, prices and durations mirror the mobile app's
// SubscriptionsPlan / RenewalSubscriptionsPlan screens so the web portal uses
// the same names and labels partners already know.
export const PARTNER_PLANS = [
  { id: 'trial_2_months', title: 'Introductory', price: 299, duration: '2 Months (60 Days)', note: 'A gentle start for new partners' },
  { id: 'monthly', title: 'Monthly Plan', price: 199, duration: 'Per Month', note: 'Flexible month-to-month growth' },
  { id: 'quarterly', title: 'Quarterly Plan', price: 499, duration: '3 Months (90 Days)', note: 'Best value for busy salons', best: true },
];
export const RENEWAL_PLANS = [
  { id: 'trial_2_months', title: 'Introductory', price: 179, duration: '2 Months (60 Days)', note: 'Restart with a simple plan' },
  { id: 'monthly', title: 'Monthly Plan', price: 99, duration: 'Per Month', note: 'Flexible month-to-month growth' },
  { id: 'quarterly', title: 'Quarterly Plan', price: 249, duration: '3 Months (90 Days)', note: 'Best value for busy salons', best: true },
];
export const FREE_ONBOARDING_PLAN = { id: 'Free', title: 'Free trial', displayPrice: '₹ 00', price: 0, duration: '20 days', note: 'Start your salon journey at no cost', best: true };

const PLAN_CATALOG = {};
// First occurrence wins, so the partner (new-purchase) list price is the
// catalog price; renewal variants only differ in price, not identity.
for (const plan of [...PARTNER_PLANS, ...RENEWAL_PLANS, FREE_ONBOARDING_PLAN]) {
  if (!PLAN_CATALOG[plan.id]) PLAN_CATALOG[plan.id] = plan;
}

function prettifyPlanId(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/free|^trial/i.test(text)) return 'Free trial';
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

// Reads the active subscription out of a get-salon profile response without
// assuming one fixed response shape. The backend has returned plan fields at
// the salon root and nested objects on different releases, so every known
// variant is checked and anything missing degrades to a graceful "unknown".
export function normalizePlanDetails(profile = {}) {
  if (!profile || typeof profile !== 'object') return null;
  const sources = [profile, profile.subscription, profile.plan, profile.planDetails, profile.salonPlan, profile.activePlan, profile.planInfo, profile.salon?.subscription]
    .filter(value => value && typeof value === 'object' && !Array.isArray(value));
  const readString = keys => {
    for (const source of sources) {
      for (const key of keys) {
        const value = source?.[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      }
    }
    return '';
  };
  const planType = readString(['planType', 'planId', 'subscriptionPlan', 'subscriptionType', 'planName'])
    || (typeof profile.plan === 'string' && profile.plan.trim() ? profile.plan.trim() : '');
  if (!planType) return null;
  const catalog = PLAN_CATALOG[planType] || {};
  const rawPrice = readString(['price', 'amount', 'planPrice', 'totalAmount']);
  const price = rawPrice !== '' ? Number(rawPrice) : catalog.price;
  const startDate = readString(['planStartDate', 'startDate', 'subscriptionStartDate', 'purchasedAt', 'createdAt']);
  const expiryDate = readString(['planExpiryDate', 'planExpiry', 'expiryDate', 'planEndDate', 'subscriptionEndDate', 'endDate', 'expiry', 'validTill', 'validUntil']);
  // Status is only trusted from nested subscription objects — a salon-root
  // `status` field describes the account, not the plan.
  const statusSources = sources.filter(source => source !== profile);
  const status = statusSources.reduce((found, source) => {
    if (found) return found;
    for (const key of ['planStatus', 'subscriptionStatus', 'status']) {
      const value = source?.[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }, '');
  const statusText = String(status).toUpperCase();
  const expiryTime = expiryDate ? new Date(expiryDate).getTime() : NaN;
  const expiredByDate = Number.isFinite(expiryTime) ? expiryTime < Date.now() : null;
  const expiredByStatus = /^(EXPIRED|INACTIVE|FALSE)$/.test(statusText) ? true : /^(ACTIVE|TRUE)$/.test(statusText) ? false : null;
  const expired = expiredByDate ?? expiredByStatus;
  const daysLeft = Number.isFinite(expiryTime) ? Math.ceil((expiryTime - Date.now()) / 86400000) : null;
  return {
    planType,
    title: catalog.title || prettifyPlanId(planType),
    duration: catalog.duration || '',
    price: Number.isFinite(price) ? price : null,
    startDate,
    expiryDate,
    daysLeft,
    expired,
    isActive: expired === null ? true : !expired,
  };
}

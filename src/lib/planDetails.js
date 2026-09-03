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

function readBoolean(sources, keys) {
  for (const source of sources) {
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string' && /^(true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === 'true';
    }
  }
  return null;
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

  // A root `status` can describe the salon account, so only use explicit plan
  // status names at the root. A generic status is safe inside subscription/plan
  // objects, which is how the mobile API has returned it in some releases.
  const rootStatus = readString(['planStatus', 'subscriptionStatus', 'plan_state', 'subscription_state']);
  const nestedStatus = sources.slice(1).reduce((found, source) => {
    if (found) return found;
    for (const key of ['planStatus', 'subscriptionStatus', 'status', 'state']) {
      const value = source?.[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }, '');
  const status = rootStatus || nestedStatus;
  const statusText = String(status).toUpperCase();

  // Explicit flags win over the date. This matters immediately after a renewal:
  // the cached profile may still contain yesterday's expiry date until the next
  // profile refresh, while the renewal response already says the plan is active.
  const explicitExpired = readBoolean(sources, ['subscriptionExpired', 'isSubscriptionExpired', 'planExpired', 'isPlanExpired']);
  const explicitActive = readBoolean(sources, ['subscriptionActive', 'isSubscriptionActive', 'planActive', 'isPlanActive']);
  const expiryTime = expiryDate ? new Date(expiryDate).getTime() : NaN;
  const expiredByDate = Number.isFinite(expiryTime) ? expiryTime < Date.now() : null;
  const expiredByStatus = /EXPIRED|INACTIVE|SUSPENDED|CANCELLED|FALSE/.test(statusText)
    ? true
    : /ACTIVE|VALID|CURRENT|TRUE/.test(statusText)
      ? false
      : null;
  const expired = explicitExpired !== null
    ? explicitExpired
    : explicitActive !== null
      ? !explicitActive
      : expiredByDate ?? expiredByStatus;
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

export function getSubscriptionState(profile = {}) {
  const plan = normalizePlanDetails(profile);
  return {
    plan,
    known: Boolean(plan && plan.expired !== null),
    expired: plan?.expired === true,
    active: plan?.expired === false,
  };
}

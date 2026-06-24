import { providers, referrals, revenueTracking } from "./mock-data";

export const dashboardMetrics = {
  providerCount: providers.length,
  approvedProviders: providers.filter((provider) => provider.status === "approved")
    .length,
  pendingProviders: providers.filter((provider) => provider.status === "pending")
    .length,
  openReferrals: referrals.filter(
    (referral) => !["Completed", "Closed"].includes(referral.status),
  ).length,
  urgentReferrals: referrals.filter((referral) => referral.urgent).length,
  estimatedMonthlyRevenue: revenueTracking.reduce(
    (total, item) => total + item.estimatedMonthlyValue,
    0,
  ),
  partnerShareEstimate: revenueTracking.reduce(
    (total, item) => total + item.partnerShareEstimate,
    0,
  ),
};

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);

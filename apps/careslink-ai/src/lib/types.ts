export type UserRole =
  | "admin"
  | "business_partner"
  | "provider"
  | "referral_source";

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  partnerId?: string;
  providerId?: string;
};

export type BusinessPartner = {
  id: string;
  name: string;
  operatorName: string;
  primaryRegion: string;
  sourceGroups: string[];
  providerCount: number;
  referralCount: number;
  revenueShareRate: number;
  status: "active" | "paused" | "pilot";
};

export type MembershipPlan = "Free" | "Pro" | "Agency";

export type ProviderStatus = "pending" | "approved" | "rejected";

export type ParticipantRole =
  | "referral_source"
  | "service_provider"
  | "both"
  | "operator";

export type OnboardingRole = Exclude<ParticipantRole, "operator">;

export type NetworkParticipant = {
  id: string;
  organizationName: string;
  role: OnboardingRole;
  canSendReferrals: boolean;
  canReceiveReferrals: boolean;
  status: ProviderStatus;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  serviceFocus: string[];
  regions: string[];
  sourcePartnerId: string;
  sourceGroupName: string;
  sourceInviteLink: string;
  createdBy: string;
  reviewedBy: string | null;
  notes: string;
  createdAt: string;
};

export type ReferralSource = {
  id: string;
  participantId: string;
  organizationName: string;
  commonReferralTypes: string[];
  usualRegions: string[];
  sourcePartnerId: string;
  sourceGroupName: string;
  trustNotes: string;
};

export type Provider = {
  id: string;
  name: string;
  serviceTypes: string[];
  serviceAreas: string[];
  languages: string[];
  contact: {
    phone?: string;
    email?: string;
    wechat?: string;
    website?: string;
  };
  abn: string;
  status: ProviderStatus;
  acceptsNewClients: boolean;
  supportsNdis: boolean;
  supportsAgedCare: boolean;
  urgentCapacity: boolean;
  chineseProvider: boolean;
  qualifications: string;
  insuranceStatus: "missing" | "uploaded" | "verified";
  intro: string;
  logoUrl: string;
  sourcePartnerId: string;
  sourceGroupName: string;
  sourceInviteLink: string;
  sourceShareCardId: string;
  membershipPlan: MembershipPlan;
  createdBy: string;
  reviewedBy: string | null;
  createdAt: string;
};

export type ProviderProfile = {
  providerId: string;
  englishIntro: string;
  chineseIntro: string;
  elevatorPitch: string;
  wechatCopy: string;
  partnerRecommendation: string;
  shareCardCopy: string;
  profilePageCopy: string;
};

export type ReferralStatus =
  | "New"
  | "Pending Match"
  | "Matched"
  | "Contacted"
  | "Accepted"
  | "Completed"
  | "Unable to Serve"
  | "Closed";

export type FundingType = "NDIS" | "Aged Care" | "Private" | "Mixed";

export type Referral = {
  id: string;
  clientArea: string;
  needType: string;
  languageRequirements: string[];
  frequency: string;
  urgent: boolean;
  fundingType: FundingType;
  summary: string;
  contactName: string;
  contactPhone: string;
  sourcePartnerId: string;
  sourceGroupName: string;
  sourceChannelId: string;
  status: ReferralStatus;
  notes: string;
  followUpDate: string;
  assignedProviderId: string | null;
  matchedProviderIds: string[];
  createdBy: string;
  followedBy: string;
  createdAt: string;
};

export type ReferralMatch = {
  id: string;
  referralId: string;
  providerId: string;
  score: number;
  reasons: string[];
  gaps: string[];
  status: "recommended" | "contacted" | "accepted" | "declined";
  createdAt: string;
};

export type ShareCard = {
  id: string;
  type: "provider" | "referral";
  providerId?: string;
  referralId?: string;
  sourcePartnerId: string;
  sourceGroupName: string;
  channel: "WeChat" | "WhatsApp" | "Xiaohongshu" | "LinkedIn";
  title: string;
  summary: string;
  cta: string;
  qrLabel: string;
  createdAt: string;
};

export type SourceChannel = {
  id: string;
  partnerId: string;
  name: string;
  type: "WeChat Group" | "Invite Link" | "Share Card" | "Manual Entry";
  providerCount: number;
  referralCount: number;
};

export type ActivityLog = {
  id: string;
  actorId: string;
  entityType: "provider" | "referral" | "share_card" | "partner";
  entityId: string;
  action: string;
  createdAt: string;
};

export type RevenueTracking = {
  id: string;
  partnerId: string;
  providerId?: string;
  referralId?: string;
  plan: MembershipPlan;
  estimatedMonthlyValue: number;
  partnerShareEstimate: number;
  status: "tracking" | "eligible" | "future";
};

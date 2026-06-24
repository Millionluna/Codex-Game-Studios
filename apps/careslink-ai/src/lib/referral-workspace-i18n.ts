export const SUPPORTED_LOCALES = ["en", "zh-Hans"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

type EntityTypeKey = "individual" | "organisation";
type ReferralDirectionKey = "receive" | "send" | "both";
type AccessCodeTypeKey =
  | "Provider Pilot"
  | "Referral Source Pilot"
  | "Dual Role Pilot"
  | "Internal Test"
  | "Partner Batch";
type HealthBandKey =
  | "Communication profile not ready"
  | "Communication profile needs work"
  | "Communication profile nearly ready"
  | "Strong communication profile";
type HealthSignalKey =
  | "entity_type"
  | "referral_direction"
  | "service_area"
  | "languages"
  | "intake_method"
  | "response_time"
  | "capacity_status"
  | "best_fit"
  | "handover_requirements"
  | "profile_readability";
type HealthIssueKey =
  | "missing_entity_type"
  | "partial_entity_type"
  | "missing_referral_direction"
  | "partial_referral_direction"
  | "missing_service_area"
  | "partial_service_area"
  | "missing_languages"
  | "partial_languages"
  | "missing_intake_method"
  | "partial_intake_method"
  | "missing_response_time"
  | "partial_response_time"
  | "missing_capacity_status"
  | "partial_capacity_status"
  | "missing_best_fit"
  | "partial_best_fit"
  | "missing_handover_requirements"
  | "partial_handover_requirements"
  | "missing_profile_readability"
  | "partial_profile_readability"
  | "unsafe_profile_readability";
type MaterialKey =
  | "provider_profile"
  | "bilingual_intro"
  | "share_card"
  | "referral_partner_message"
  | "intake_checklist"
  | "referral_source_profile"
  | "provider_requirement_brief"
  | "handover_template"
  | "consent_reminder"
  | "follow_up_message";
type QueueItemKey =
  | "profile"
  | "readiness"
  | "share-card"
  | "referral-message"
  | "trust-copy";

const LOCALE_QUERY_PARAM = "lang";

type ReferralWorkspaceSearchParams =
  | {
      readonly [key: string]: string | readonly string[] | undefined;
    }
  | Pick<URLSearchParams, "get">
  | undefined;

export type ReferralWorkspaceCopy = {
  readonly common: {
    readonly previewOnly: string;
    readonly selfSubmitted: string;
    readonly continueToReadiness: string;
    readonly trustBoundary: string;
    readonly nonLiveActions: string;
  };
  readonly shell: {
    readonly brand: string;
    readonly subtitle: string;
    readonly language: string;
    readonly pilotPreview: string;
    readonly pilotBoundary: string;
    readonly primaryNav: {
      readonly workspace: string;
      readonly profile: string;
      readonly health: string;
      readonly materials: string;
      readonly accessCode: string;
      readonly accessRequests: string;
    };
    readonly legacyNav: {
      readonly groupHeading: string;
      readonly demoHub: string;
      readonly assessment: string;
      readonly dashboard: string;
      readonly referrals: string;
      readonly providers: string;
      readonly referralSourcePortal: string;
      readonly providerPortal: string;
    };
  };
  readonly workspace: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly requestAccess: string;
    readonly accessRequests: string;
    readonly routeBlockTitle: string;
    readonly routeBlockDescription: string;
    readonly plannedRoutesTitle: string;
    readonly plannedRoutesDescription: string;
    readonly adminAccessQueue: string;
    readonly routes: Record<
      "profile" | "health" | "materials" | "access",
      {
        readonly label: string;
        readonly detail: string;
      }
    >;
  };
  readonly profile: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly identitySection: string;
    readonly footprintSection: string;
    readonly receiveSection: string;
    readonly sendSection: string;
    readonly roleMatrixTitle: string;
    readonly noPersistence: string;
    readonly builderExample: string;
    readonly builderDescription: string;
    readonly formLabel: string;
    readonly relevantToProfile: string;
    readonly notUsedForDirection: string;
    readonly relevant: string;
    readonly notUsed: string;
    readonly identityDescription: string;
    readonly footprintDescription: string;
    readonly receiveDescription: string;
    readonly sendDescription: string;
    readonly previewBoundaryTitle: string;
    readonly previewBoundaryDescription: string;
    readonly roleMatrixDescription: string;
    readonly directionHelp: Record<ReferralDirectionKey, string>;
    readonly fields: {
      readonly entityType: string;
      readonly profileName: string;
      readonly referralDirection: string;
      readonly lastUpdated: string;
      readonly profileSummary: string;
      readonly serviceAreas: string;
      readonly languages: string;
      readonly referralFitNotes: string;
      readonly intakeMethod: string;
      readonly responseTime: string;
      readonly capacityStatus: string;
      readonly handoverRequirements: string;
      readonly followUpCadence: string;
      readonly consentReminder: string;
    };
    readonly tableColumns: {
      readonly profile: string;
      readonly entityType: string;
      readonly referralDirection: string;
      readonly receiveSide: string;
      readonly sendSide: string;
    };
    readonly receiveDetailsMissing: string;
    readonly receiveNotUsed: string;
    readonly sendNotUsed: string;
  };
  readonly health: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly scoreMeaningTitle: string;
    readonly scoreMeaning: string;
    readonly profileBuilder: string;
    readonly materialsPreview: string;
    readonly metrics: {
      readonly signalsReviewed: {
        readonly label: string;
        readonly detail: string;
      };
      readonly openIssues: {
        readonly label: string;
        readonly detail: string;
      };
      readonly highPriority: {
        readonly label: string;
        readonly detail: string;
      };
    };
    readonly nextStepFlowTitle: string;
    readonly nextStepFlowDescription: string;
    readonly nextSteps: Record<
      "profile" | "materials" | "access",
      {
        readonly label: string;
        readonly detail: string;
      }
    >;
  };
  readonly materials: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly freeMode: string;
    readonly accessMode: string;
    readonly noAiCall: string;
    readonly currentModeTitle: string;
    readonly accessCodeGuidedPreview: string;
    readonly freePreviewWithoutCode: string;
    readonly accessModeDetail: string;
    readonly freeModeDetail: string;
    readonly userApproved: string;
    readonly userFree: string;
    readonly accessCode: string;
    readonly activeForDemo: string;
    readonly notPresent: string;
    readonly guidedQuota: string;
    readonly usedDailyQuota: string;
    readonly remainingToday: string;
    readonly viewFreePreview: string;
    readonly accessRequestPreview: string;
    readonly tryAccessCodeDemo: string;
    readonly readinessAudit: string;
    readonly freePreview: string;
    readonly accessDemo: string;
    readonly access: string;
    readonly deterministicPreviewTitle: string;
    readonly guidedReviewBoundary: string;
    readonly freePreviewBoundary: string;
    readonly accessStateBoundary: string;
  };
  readonly access: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly disabledSubmit: string;
    readonly costControlTitle: string;
    readonly costControl: string;
    readonly materialsDemo: string;
    readonly adminQueue: string;
    readonly costControlItems: readonly string[];
    readonly applicationFieldsTitle: string;
    readonly applicationFieldsDescription: string;
    readonly previewOnlyNoSubmit: string;
    readonly formLabel: string;
    readonly fields: {
      readonly profile: string;
      readonly entityType: string;
      readonly referralDirection: string;
      readonly requestedCodeType: string;
      readonly sourceInvite: string;
      readonly expectedDailyQuota: string;
      readonly reason: string;
      readonly abuseCostControlNote: string;
    };
    readonly fieldValues: {
      readonly sourceInvite: string;
      readonly expectedDailyQuota: string;
      readonly reason: string;
      readonly abuseCostControlNote: string;
    };
    readonly previewRequestStateTitle: string;
    readonly previewRequestStateDescription: string;
    readonly disabledButton: string;
    readonly viewAccessCodeMaterialsDemo: string;
    readonly openAdminQueue: string;
    readonly previewDestinationsTitle: string;
    readonly previewDestinationsDescription: string;
    readonly freeMaterials: string;
    readonly accessCodeDemo: string;
  };
  readonly admin: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly boundary: string;
    readonly accessPreview: string;
    readonly workspace: string;
    readonly metrics: {
      readonly queued: {
        readonly label: string;
        readonly detail: string;
      };
      readonly accessActive: {
        readonly label: string;
        readonly detail: string;
      };
      readonly declined: {
        readonly label: string;
        readonly detail: string;
      };
      readonly directionMix: {
        readonly label: string;
      };
    };
    readonly noRequestsInQueue: string;
    readonly requestCount: {
      readonly one: string;
      readonly other: string;
    };
    readonly statusLabels: Record<"queued" | "approved" | "declined", string>;
    readonly directionLabels: Record<ReferralDirectionKey, string>;
    readonly directionSummaryLabels: Record<ReferralDirectionKey, string>;
    readonly boundaryTitle: string;
    readonly requestQueueTitle: string;
    readonly requestQueueDescription: string;
    readonly requestFrom: string;
    readonly fields: {
      readonly userId: string;
      readonly requestedCodeType: string;
      readonly referralDirection: string;
      readonly requestedTime: string;
      readonly noteOrReason: string;
    };
    readonly reviewAffordancesTitle: string;
    readonly reviewAffordancesDescription: string;
    readonly previewActionTitle: string;
    readonly previewActions: {
      readonly approve: string;
      readonly waitlist: string;
      readonly decline: string;
    };
    readonly requestedCodeTypesTitle: string;
    readonly noRequestedCodeTypes: string;
    readonly reviewFocusTitle: string;
    readonly reviewFocusItems: readonly string[];
  };
  readonly components: {
    readonly basicProfile: {
      readonly serviceArea: string;
      readonly languages: string;
      readonly emptyPlaceholder: string;
      readonly descriptionNeedsReview: string;
      readonly footer: string;
      readonly entityLabels: Record<EntityTypeKey, string>;
      readonly directionLabels: Record<ReferralDirectionKey, string>;
    };
    readonly healthScore: {
      readonly heading: string;
      readonly summary: string;
      readonly note: string;
      readonly defaultRecommendation: string;
      readonly bandLabels: Record<HealthBandKey, string>;
    };
    readonly healthSignals: {
      readonly heading: string;
      readonly description: string;
      readonly columns: {
        readonly signal: string;
        readonly detail: string;
        readonly points: string;
        readonly status: string;
      };
      readonly statusLabels: {
        readonly good: string;
        readonly warning: string;
        readonly high: string;
      };
      readonly signals: Record<
        HealthSignalKey,
        {
          readonly label: string;
          readonly detail: string;
        }
      >;
    };
    readonly topIssues: {
      readonly heading: string;
      readonly description: string;
      readonly countLabel: {
        readonly one: string;
        readonly other: string;
      };
      readonly priorityLabels: {
        readonly high: string;
        readonly warning: string;
      };
      readonly emptyTitle: string;
      readonly emptyDetail: string;
      readonly issues: Record<
        HealthIssueKey,
        {
          readonly label: string;
          readonly title: string;
          readonly guidance: string;
        }
      >;
    };
    readonly materialsGrid: {
      readonly heading: string;
      readonly description: string;
      readonly guidedAvailable: string;
      readonly readyMessage: string;
      readonly noMaterialsTitle: string;
      readonly noMaterialsDetail: string;
      readonly directionLabels: {
        readonly receive: string;
        readonly send: string;
      };
      readonly lockedStatusLabels: {
        readonly quotaUsed: string;
        readonly waitlist: string;
        readonly accessRequired: string;
      };
      readonly lockedMessages: {
        readonly quotaUsed: string;
        readonly waitlist: string;
        readonly accessRequired: string;
      };
      readonly materials: Record<
        MaterialKey,
        {
          readonly label: string;
          readonly description: string;
          readonly preview: string;
        }
      >;
    };
    readonly agentQueue: {
      readonly heading: string;
      readonly description: string;
      readonly readyLabel: string;
      readonly lockedBadgeLabels: {
        readonly quotaUsed: string;
        readonly queued: string;
        readonly accessCode: string;
      };
      readonly items: Record<
        QueueItemKey,
        {
          readonly label: string;
          readonly freeState: string;
          readonly accessCodeState: string;
        }
      >;
    };
    readonly accessStatus: {
      readonly heading: string;
      readonly states: {
        readonly active: {
          readonly label: string;
          readonly detail: string;
        };
        readonly quotaUsed: {
          readonly label: string;
          readonly detail: string;
        };
        readonly waitlist: {
          readonly label: string;
          readonly detail: string;
        };
        readonly free: {
          readonly label: string;
          readonly detail: string;
        };
      };
      readonly accessCodeLabel: string;
      readonly present: string;
      readonly notPresent: string;
      readonly usedToday: string;
      readonly remaining: string;
      readonly dailyGuidedQuota: string;
      readonly codeTypeLabels: Record<AccessCodeTypeKey, string>;
    };
    readonly copilot: {
      readonly heading: string;
      readonly description: string;
      readonly profileContextLabel: string;
      readonly readinessContextLabel: string;
      readonly guidedStepLabel: string;
      readonly previewStepLabel: string;
      readonly accessBoundaryLabel: string;
      readonly noProfileContext: string;
      readonly readinessScore: string;
      readonly noQueueItem: string;
      readonly draftingPromptReady: string;
      readonly boundaryMessages: {
        readonly quotaUsed: string;
        readonly waitlist: string;
        readonly accessRequired: string;
      };
    };
  };
};

const localeLabels: Record<Locale, string> = {
  en: "English",
  "zh-Hans": "简体中文",
};

const referralWorkspaceCopy: Record<Locale, ReferralWorkspaceCopy> = {
  en: {
    common: {
      previewOnly: "Preview mode only",
      selfSubmitted: "Based on self-submitted profile information",
      continueToReadiness: "Continue to readiness review",
      trustBoundary:
        "Based on self-submitted profile information. CaresLink does not assess provider quality, clinical suitability, compliance status, or service outcomes, and does not provide legal, clinical, medical, compliance, financial, or other professional advice.",
      nonLiveActions:
        "Pilot actions are non-live previews. No referral, endorsement, compliance review, or professional recommendation is created.",
    },
    shell: {
      brand: "CaresLink",
      subtitle: "Referral Profile Workspace",
      language: "Language",
      pilotPreview: "Pilot preview",
      pilotBoundary:
        "Use this workspace to structure referral communication. CaresLink does not verify provider quality, clinical suitability, compliance status, or outcomes.",
      primaryNav: {
        workspace: "Workspace",
        profile: "Profile",
        health: "Readiness",
        materials: "Materials",
        accessCode: "Access code",
        accessRequests: "Access requests",
      },
      legacyNav: {
        groupHeading: "Legacy demos",
        demoHub: "Legacy demo hub",
        assessment: "Legacy assessment",
        dashboard: "Dashboard",
        referrals: "Referrals",
        providers: "Providers",
        referralSourcePortal: "Referral source portal",
        providerPortal: "Provider portal",
      },
    },
    workspace: {
      eyebrow: "Referral workspace",
      title: "Build a clear referral profile",
      description:
        "Review self-submitted profile fields, readiness signals, gated materials, and access status in one pilot workspace.",
      requestAccess: "Request access",
      accessRequests: "Access requests",
      routeBlockTitle: "Workspace route unavailable",
      routeBlockDescription:
        "This pilot route is intentionally limited while the referral profile workflow is being prepared.",
      plannedRoutesTitle: "Planned workspace routes",
      plannedRoutesDescription:
        "These links show the intended navigation for profile editing, readiness review, guided material previews, access-code entry, and pilot access administration.",
      adminAccessQueue: "Admin access queue",
      routes: {
        profile: {
          label: "Profile",
          detail: "Edit self-submitted referral communication fields.",
        },
        health: {
          label: "Readiness",
          detail: "Review completeness signals and priority gaps.",
        },
        materials: {
          label: "Materials",
          detail: "Preview share cards, handover copy, and intake prompts.",
        },
        access: {
          label: "Access",
          detail: "Request or enter an access code for guided drafting.",
        },
      },
    },
    profile: {
      eyebrow: "Profile basics",
      title: "Referral profile",
      description:
        "Organise identity, service footprint, receiving details, and sending details without implying approval or endorsement.",
      identitySection: "Identity",
      footprintSection: "Service footprint",
      receiveSection: "Receive referrals",
      sendSection: "Send referrals",
      roleMatrixTitle: "Referral role matrix",
      noPersistence:
        "Changes shown here are preview-only and are not persisted to a live provider record.",
      builderExample: "Builder example",
      builderDescription:
        "Seeded Harbour data is shown as a first-version profile builder. Fields are read-only in this slice and do not persist changes.",
      formLabel: "Read-only referral profile builder",
      relevantToProfile: "Relevant to this profile",
      notUsedForDirection: "Not used for this direction",
      relevant: "Relevant",
      notUsed: "Not used",
      identityDescription:
        "Set who the profile represents, how it participates in referrals, and the self-submitted summary referrers can read.",
      footprintDescription:
        "Capture where the profile is relevant, the languages submitted, and the referral fit notes used for communication readiness.",
      receiveDescription:
        "Receive-side details stay separate from send-side handover information.",
      sendDescription:
        "Send-side details describe what should travel with an outgoing referral and how follow-up is handled.",
      previewBoundaryTitle: "Preview and non-live boundary",
      previewBoundaryDescription:
        "This page uses seeded profile data only. It does not save edits, issue access codes, or perform real account actions.",
      roleMatrixDescription:
        "The seed set shows how individual and organisation profiles can receive referrals, send referrals, or do both while keeping each side of the profile distinct.",
      directionHelp: {
        receive:
          "Receive-side profiles explain how referrers can introduce a person and what helps intake.",
        send:
          "Send-side profiles explain what information travels with a referral handover.",
        both:
          "Both-direction profiles keep receive and send details separate for each referral conversation.",
      },
      fields: {
        entityType: "Entity type",
        profileName: "Profile name",
        referralDirection: "Referral direction",
        lastUpdated: "Last updated",
        profileSummary: "Profile summary",
        serviceAreas: "Service areas",
        languages: "Languages",
        referralFitNotes: "Referral fit notes",
        intakeMethod: "Intake method",
        responseTime: "Response time",
        capacityStatus: "Capacity status",
        handoverRequirements: "Handover requirements",
        followUpCadence: "Follow-up cadence",
        consentReminder: "Consent reminder",
      },
      tableColumns: {
        profile: "Profile",
        entityType: "Entity type",
        referralDirection: "Referral direction",
        receiveSide: "Receive side",
        sendSide: "Send side",
      },
      receiveDetailsMissing: "Receive details not yet provided.",
      receiveNotUsed:
        "Receive fields are separate and not used for this direction.",
      sendNotUsed: "Send fields are separate and not used for this direction.",
    },
    health: {
      eyebrow: "Readiness health",
      title: "Profile readiness",
      description:
        "Check whether the submitted profile is clear enough for referral conversations, without scoring quality, suitability, or compliance.",
      scoreMeaningTitle: "What the score means",
      scoreMeaning:
        "The score reflects communication completeness and clarity only. It is not a provider quality assessment, clinical assessment, compliance assessment, or outcome prediction.",
      profileBuilder: "Profile builder",
      materialsPreview: "Materials preview",
      metrics: {
        signalsReviewed: {
          label: "Signals reviewed",
          detail: "Profile fields checked for communication completeness.",
        },
        openIssues: {
          label: "Open issues",
          detail: "Gaps sorted by priority for this profile.",
        },
        highPriority: {
          label: "High priority",
          detail:
            "Items to address before relying on the profile for referral conversations.",
        },
      },
      nextStepFlowTitle: "Next-step flow",
      nextStepFlowDescription:
        "Use the audit to choose what to update, then review preview materials and the access request screen.",
      nextSteps: {
        profile: {
          label: "Profile builder",
          detail:
            "Review the self-submitted fields that affect referral communication readiness.",
        },
        materials: {
          label: "Materials preview",
          detail:
            "Preview profile copy, share cards, and intake prompts from the current fields.",
        },
        access: {
          label: "Access request",
          detail:
            "View the pilot access request state. Submission and guided drafting are not live here.",
        },
      },
    },
    materials: {
      eyebrow: "Referral materials",
      title: "Guided materials",
      description:
        "Preview profile summaries, referral messages, handover prompts, and share-card copy generated from submitted fields.",
      freeMode:
        "Free mode shows structure and locked previews without calling AI drafting actions.",
      accessMode:
        "Access code mode unlocks guided drafting within quota and pilot limits.",
      noAiCall:
        "No AI call is made in preview-only mode, and no live referral action is sent.",
      currentModeTitle: "Current materials mode",
      accessCodeGuidedPreview: "Access-code guided preview",
      freePreviewWithoutCode: "Free preview without an access code",
      accessModeDetail:
        "This demo route uses the approved access state so guided drafting steps, unlocked materials, and quota state are visible.",
      freeModeDetail:
        "This route shows the default free state: material previews are visible, while guided drafting remains gated behind an access code.",
      userApproved: "user-approved",
      userFree: "user-free",
      accessCode: "Access code",
      activeForDemo: "Active for demo",
      notPresent: "Not present",
      guidedQuota: "Guided quota",
      usedDailyQuota: "{used} used / {total} daily",
      remainingToday: "Remaining today",
      viewFreePreview: "View free preview",
      accessRequestPreview: "Access request preview",
      tryAccessCodeDemo: "Try access-code demo",
      readinessAudit: "Readiness audit",
      freePreview: "Free preview",
      accessDemo: "Access demo",
      access: "Access",
      deterministicPreviewTitle: "Deterministic UI preview",
      guidedReviewBoundary:
        "Guided steps are visible for access-code review, but users still review and control any future drafted material.",
      freePreviewBoundary:
        "Free preview keeps material requirements visible while showing exactly where access-code gating applies.",
      accessStateBoundary:
        "Access state does not signal endorsement, certification, clinical review, compliance approval, or any guaranteed referral outcome.",
    },
    access: {
      eyebrow: "Access controls",
      title: "Pilot access",
      description:
        "Access codes gate guided materials and daily quota during the pilot.",
      disabledSubmit:
        "Submission is disabled in this preview. Requests can be reviewed by pilot admins only.",
      costControlTitle: "Cost control",
      costControl:
        "Access gating keeps AI-assisted drafting behind explicit pilot approval and daily usage limits.",
      materialsDemo: "Materials demo",
      adminQueue: "Admin queue",
      costControlItems: [
        "Control AI cost with a small daily guided drafting quota.",
        "Reduce abuse, multi-account scraping, and automated extraction of pilot materials.",
        "Keep the first pilot invite-based until review and support flows are ready for broader access.",
      ],
      applicationFieldsTitle: "Application fields",
      applicationFieldsDescription:
        "These disabled fields show what the first access-code request could collect for pilot review. They are seeded preview values, not submitted form data.",
      previewOnlyNoSubmit: "Preview only: no submit",
      formLabel: "Access code application preview",
      fields: {
        profile: "Profile",
        entityType: "Entity type",
        referralDirection: "Referral direction",
        requestedCodeType: "Requested code type",
        sourceInvite: "Source/invite",
        expectedDailyQuota: "Expected daily quota",
        reason: "Reason",
        abuseCostControlNote: "Abuse and cost control note",
      },
      fieldValues: {
        sourceInvite: "Invite from referral workspace pilot",
        expectedDailyQuota: "{count} guided drafting actions per day",
        reason:
          "Prepare guided referral communication materials from submitted profile details while keeping preview content clearly separate from live generation.",
        abuseCostControlNote:
          "Access codes limit guided drafting quota, reduce automated scraping or multi-account abuse, and keep the v0.1 pilot invite-based.",
      },
      previewRequestStateTitle: "Preview request state",
      previewRequestStateDescription:
        "This page does not create an access request, send email, call OpenAI, or enqueue an admin review. It only previews the first version of the application surface.",
      disabledButton: "Preview only - request not submitted",
      viewAccessCodeMaterialsDemo: "View access-code materials demo",
      openAdminQueue: "Open admin queue",
      previewDestinationsTitle: "Preview destinations",
      previewDestinationsDescription:
        "Use these links to compare the no-code materials preview, the access-code materials demo, and the seeded admin queue without changing live access state.",
      freeMaterials: "Free materials",
      accessCodeDemo: "Access-code demo",
    },
    admin: {
      eyebrow: "Pilot admin",
      title: "Access request review",
      description:
        "Review queued access requests, code types, and profile context for the pilot workspace.",
      boundary:
        "Admin review manages pilot access only. CaresLink does not assess provider quality, clinical suitability, compliance status, or service outcomes, and does not provide professional advice.",
      accessPreview: "Access preview",
      workspace: "Workspace",
      metrics: {
        queued: {
          label: "Queued",
          detail: "Requests waiting for access review.",
        },
        accessActive: {
          label: "Access active",
          detail: "Mock records with access currently active.",
        },
        declined: {
          label: "Declined",
          detail: "Requests not granted access in the mock queue.",
        },
        directionMix: {
          label: "Direction mix",
        },
      },
      noRequestsInQueue: "No requests in queue.",
      requestCount: {
        one: "{count} request",
        other: "{count} requests",
      },
      statusLabels: {
        queued: "Queued",
        approved: "Access active",
        declined: "Declined",
      },
      directionLabels: {
        receive: "Receive referrals",
        send: "Send referrals",
        both: "Receive and send referrals",
      },
      directionSummaryLabels: {
        receive: "Receive",
        send: "Send",
        both: "Both",
      },
      boundaryTitle: "Access review boundary",
      requestQueueTitle: "Request queue",
      requestQueueDescription:
        "Review submitted profile context before any future access decision is applied outside this mock.",
      requestFrom: "Request {requestId} from {userId}",
      fields: {
        userId: "User ID",
        requestedCodeType: "Requested code type",
        referralDirection: "Referral direction",
        requestedTime: "Requested time",
        noteOrReason: "Note or reason",
      },
      reviewAffordancesTitle: "Read-only review affordances",
      reviewAffordancesDescription:
        "Disabled preview controls only. No access code, quota change, or notification is produced here.",
      previewActionTitle:
        "Preview only. This mock does not change access, quota, codes, or notifications.",
      previewActions: {
        approve: "Preview approve",
        waitlist: "Preview waitlist",
        decline: "Preview decline",
      },
      requestedCodeTypesTitle: "Requested code types",
      noRequestedCodeTypes: "No requested code types in this queue.",
      reviewFocusTitle: "Review focus",
      reviewFocusItems: [
        "Confirm the requested pilot code type and referral direction.",
        "Check invite source and expected quota use before access.",
        "Watch for repeated requests, duplicate users, or multi-account misuse patterns.",
        "Keep provider quality, outcomes, clinical suitability, and compliance judgments outside this access queue.",
      ],
    },
    components: {
      basicProfile: {
        serviceArea: "Service area",
        languages: "Languages",
        emptyPlaceholder: "Not yet provided",
        descriptionNeedsReview:
          "The self-submitted profile summary needs review before it can be displayed.",
        footer:
          "Built from self-submitted information. Not a provider endorsement.",
        entityLabels: {
          individual: "Individual",
          organisation: "Organisation",
        },
        directionLabels: {
          receive: "Receives referrals",
          send: "Sends referrals",
          both: "Receives and sends referrals",
        },
      },
      healthScore: {
        heading: "Referral communication score",
        summary:
          "This audit measures referral communication readiness only, not provider quality.",
        note:
          "This audit measures referral communication readiness only, not provider quality.",
        defaultRecommendation:
          "Keep referral profile details current before sharing.",
        bandLabels: {
          "Communication profile not ready":
            "Communication profile not ready",
          "Communication profile needs work":
            "Communication profile needs work",
          "Communication profile nearly ready":
            "Communication profile nearly ready",
          "Strong communication profile": "Strong communication profile",
        },
      },
      healthSignals: {
        heading: "Readiness signals",
        description:
          "Field-level signals for referral communication completeness.",
        columns: {
          signal: "Signal",
          detail: "Detail",
          points: "Points",
          status: "Status",
        },
        statusLabels: {
          good: "Complete",
          warning: "Needs detail",
          high: "Missing",
        },
        signals: {
          entity_type: {
            label: "Entity type",
            detail:
              "Shows whether the profile represents an individual or organisation.",
          },
          referral_direction: {
            label: "Referral direction",
            detail: "Shows whether the profile receives, sends, or does both.",
          },
          service_area: {
            label: "Service area",
            detail: "Explains where referrals are relevant.",
          },
          languages: {
            label: "Languages",
            detail: "Sets language expectations before a referral is made.",
          },
          intake_method: {
            label: "Intake method",
            detail: "Clarifies how receive-side referrals should arrive.",
          },
          response_time: {
            label: "Response time",
            detail: "Sets expectations for referral acknowledgement.",
          },
          capacity_status: {
            label: "Capacity status",
            detail: "Communicates current receive-side availability.",
          },
          best_fit: {
            label: "Best fit",
            detail: "Explains which referrals are most appropriate.",
          },
          handover_requirements: {
            label: "Handover requirements",
            detail:
              "Clarifies what information should travel with sent referrals.",
          },
          profile_readability: {
            label: "Profile readability",
            detail:
              "Add clear self-submitted profile summary text for referral communication context.",
          },
        },
      },
      topIssues: {
        heading: "Top issues",
        description:
          "Prioritized gaps in the referral communication profile.",
        countLabel: {
          one: "1 item",
          other: "{count} items",
        },
        priorityLabels: {
          high: "High priority",
          warning: "Needs detail",
        },
        emptyTitle: "No priority issues",
        emptyDetail:
          "This audit did not find priority communication gaps in the current profile.",
        issues: {
          missing_entity_type: {
            label: "Entity type",
            title: "Entity type is missing",
            guidance:
              "Shows whether the profile represents an individual or organisation.",
          },
          partial_entity_type: {
            label: "Entity type",
            title: "Entity type needs detail",
            guidance:
              "Shows whether the profile represents an individual or organisation.",
          },
          missing_referral_direction: {
            label: "Referral direction",
            title: "Referral direction is missing",
            guidance: "Shows whether the profile receives, sends, or does both.",
          },
          partial_referral_direction: {
            label: "Referral direction",
            title: "Referral direction needs detail",
            guidance: "Shows whether the profile receives, sends, or does both.",
          },
          missing_service_area: {
            label: "Service area",
            title: "Service area is missing",
            guidance: "Explains where referrals are relevant.",
          },
          partial_service_area: {
            label: "Service area",
            title: "Service area needs detail",
            guidance: "Explains where referrals are relevant.",
          },
          missing_languages: {
            label: "Languages",
            title: "Languages are missing",
            guidance: "Sets language expectations before a referral is made.",
          },
          partial_languages: {
            label: "Languages",
            title: "Languages need detail",
            guidance: "Sets language expectations before a referral is made.",
          },
          missing_intake_method: {
            label: "Intake method",
            title: "Intake method is missing",
            guidance:
              "Describe the preferred referral entry point, such as a form, email, or warm handover.",
          },
          partial_intake_method: {
            label: "Intake method",
            title: "Intake method needs detail",
            guidance:
              "Describe the preferred referral entry point, such as a form, email, or warm handover.",
          },
          missing_response_time: {
            label: "Response time",
            title: "Response time is missing",
            guidance: "Sets expectations for referral acknowledgement.",
          },
          partial_response_time: {
            label: "Response time",
            title: "Response time needs detail",
            guidance: "Sets expectations for referral acknowledgement.",
          },
          missing_capacity_status: {
            label: "Capacity status",
            title: "Capacity status is missing",
            guidance:
              "Add a current availability note so referrers know whether to send new enquiries.",
          },
          partial_capacity_status: {
            label: "Capacity status",
            title: "Capacity status needs detail",
            guidance:
              "Add current availability detail, such as timing, limits, or next review date.",
          },
          missing_best_fit: {
            label: "Best fit",
            title: "Best fit is missing",
            guidance: "Explains which referrals are most appropriate.",
          },
          partial_best_fit: {
            label: "Best fit",
            title: "Best fit needs detail",
            guidance: "Explains which referrals are most appropriate.",
          },
          missing_handover_requirements: {
            label: "Handover requirements",
            title: "Handover requirements are missing",
            guidance:
              "List the information needed before a referral can be introduced.",
          },
          partial_handover_requirements: {
            label: "Handover requirements",
            title: "Handover requirements need detail",
            guidance:
              "List the information needed before a referral can be introduced.",
          },
          missing_profile_readability: {
            label: "Profile readability",
            title: "Profile summary needs review",
            guidance:
              "Add clear self-submitted profile summary text for referral communication context.",
          },
          partial_profile_readability: {
            label: "Profile readability",
            title: "Profile summary needs detail",
            guidance:
              "Add clear self-submitted profile summary text for referral communication context.",
          },
          unsafe_profile_readability: {
            label: "Profile readability",
            title: "Profile summary needs review",
            guidance:
              "Revise the self-submitted profile summary to remove claims that suggest verification, endorsement, outcomes, clinical suitability, or compliance status.",
          },
        },
      },
      materialsGrid: {
        heading: "Guided materials",
        description:
          "Preview text remains visible when guided drafting is locked.",
        guidedAvailable: "Guided drafting available",
        readyMessage:
          "Ready for guided drafting from submitted profile details.",
        noMaterialsTitle: "No materials configured",
        noMaterialsDetail:
          "Materials appear here when a receive or send direction is available for the profile.",
        directionLabels: {
          receive: "Receive",
          send: "Send",
        },
        lockedStatusLabels: {
          quotaUsed: "Quota used today",
          waitlist: "Access request queued",
          accessRequired: "Access code required",
        },
        lockedMessages: {
          quotaUsed: "Daily guided quota used. Preview remains visible.",
          waitlist:
            "Access request queued. Preview remains visible while the request is pending.",
          accessRequired: "Access code required for guided materials.",
        },
        materials: {
          provider_profile: {
            label: "Provider profile",
            description:
              "A structured receive-side profile for referrers to review.",
            preview:
              "Service areas, languages, intake method, and availability.",
          },
          bilingual_intro: {
            label: "Bilingual introduction",
            description:
              "Plain-language introduction copy for multilingual sharing.",
            preview:
              "Short English and community-language profile introduction.",
          },
          share_card: {
            label: "Share card",
            description:
              "A compact profile card for clear referral conversations.",
            preview: "Name, fit, areas, contact path, and access disclaimer.",
          },
          referral_partner_message: {
            label: "Referral partner message",
            description:
              "A guided message for introducing the profile to referrers.",
            preview: "Referral context, best-fit summary, and next-step prompt.",
          },
          intake_checklist: {
            label: "Intake checklist",
            description:
              "A receive-side checklist for consistent referral intake.",
            preview: "Consent, need, urgency, language, and follow-up details.",
          },
          referral_source_profile: {
            label: "Referral source profile",
            description:
              "A structured send-side profile for provider introductions.",
            preview:
              "Referral role, client context, and communication preferences.",
          },
          provider_requirement_brief: {
            label: "Provider requirement brief",
            description:
              "A concise brief of what providers need before handover.",
            preview: "Client goal, service need, timing, and language requirements.",
          },
          handover_template: {
            label: "Handover template",
            description:
              "A guided template for sending complete referral context.",
            preview: "Consent status, support need, risks, and preferred next step.",
          },
          consent_reminder: {
            label: "Consent reminder",
            description:
              "A reminder block for checking consent before sharing details.",
            preview: "Confirm consent scope before contacting a provider.",
          },
          follow_up_message: {
            label: "Follow-up message",
            description: "A short follow-up prompt after a provider handover.",
            preview:
              "Check whether the provider accepted, declined, or needs details.",
          },
        },
      },
      agentQueue: {
        heading: "Agent queue",
        description:
          "Guided steps are based on submitted profile fields and access state.",
        readyLabel: "Ready",
        lockedBadgeLabels: {
          quotaUsed: "Quota used",
          queued: "Queued",
          accessCode: "Access code",
        },
        items: {
          profile: {
            label: "Profile Agent",
            freeState: "Preview basic profile structure and missing fields.",
            accessCodeState:
              "Guide profile wording from the submitted details.",
          },
          readiness: {
            label: "Readiness Agent",
            freeState: "Show readiness signals and issue priorities.",
            accessCodeState:
              "Suggest focused edits for referral communication gaps.",
          },
          "share-card": {
            label: "Share Card Agent",
            freeState: "Preview locked share-card material.",
            accessCodeState:
              "Prepare a concise share card from submitted profile fields.",
          },
          "referral-message": {
            label: "Referral Message Agent",
            freeState: "Preview referral message requirements.",
            accessCodeState: "Draft a guided referral message for review.",
          },
          "trust-copy": {
            label: "Trust Copy Agent",
            freeState: "Preview trust-copy prompts and disclaimers.",
            accessCodeState: "Draft plain-language trust copy for review.",
          },
        },
      },
      accessStatus: {
        heading: "Access status",
        states: {
          active: {
            label: "Access code active",
            detail:
              "Guided materials are available while daily quota remains.",
          },
          quotaUsed: {
            label: "Quota used today",
            detail:
              "Preview materials remain visible. Guided drafting unlocks again with available quota.",
          },
          waitlist: {
            label: "Access request queued",
            detail:
              "Preview materials remain visible until an access code is active.",
          },
          free: {
            label: "Free preview",
            detail:
              "Preview materials are visible. Guided drafting requires an access code.",
          },
        },
        accessCodeLabel: "Access code",
        present: "Present",
        notPresent: "Not present",
        usedToday: "Used today",
        remaining: "Remaining",
        dailyGuidedQuota: "Daily guided quota",
        codeTypeLabels: {
          "Provider Pilot": "Provider Pilot",
          "Referral Source Pilot": "Referral Source Pilot",
          "Dual Role Pilot": "Dual Role Pilot",
          "Internal Test": "Internal Test",
          "Partner Batch": "Partner Batch",
        },
      },
      copilot: {
        heading: "Guided copilot",
        description: "Right-side workspace for profile drafting prompts.",
        profileContextLabel: "Profile context",
        readinessContextLabel: "Readiness context",
        guidedStepLabel: "Guided step",
        previewStepLabel: "Preview step",
        accessBoundaryLabel: "Access boundary",
        noProfileContext: "Select a profile to show submitted referral context.",
        readinessScore: "Current score is {score} out of 100.",
        noQueueItem:
          "Queue items appear here when a guided workflow is configured.",
        draftingPromptReady: "Drafting prompt ready",
        boundaryMessages: {
          quotaUsed:
            "Daily guided quota used. Preview materials remain visible.",
          waitlist:
            "Access request queued. Preview materials remain visible while the request is pending.",
          accessRequired:
            "Access code required before guided drafting is available. Preview materials remain visible.",
        },
      },
    },
  },
  "zh-Hans": {
    common: {
      previewOnly: "仅预览模式",
      selfSubmitted: "基于自行提交的资料信息",
      continueToReadiness: "继续查看准备度",
      trustBoundary:
        "资料信息基于自行提交的资料信息。CaresLink 不评估服务商质量、临床适用性、合规状态或服务结果，也不提供法律、临床、医疗、合规、财务或其他专业建议。",
      nonLiveActions:
        "试点操作仅为非实时预览，不会创建转介、背书、合规审查或专业建议。",
    },
    shell: {
      brand: "CaresLink",
      subtitle: "转介资料工作区",
      language: "语言",
      pilotPreview: "试点预览",
      pilotBoundary:
        "此工作区用于整理转介沟通。CaresLink 不核验服务商质量、临床适用性、合规状态或服务结果。",
      primaryNav: {
        workspace: "工作区",
        profile: "资料",
        health: "准备度",
        materials: "材料",
        accessCode: "访问码",
        accessRequests: "访问申请",
      },
      legacyNav: {
        groupHeading: "旧版演示",
        demoHub: "旧版演示中心",
        assessment: "旧版评估",
        dashboard: "仪表盘",
        referrals: "转介",
        providers: "服务商",
        referralSourcePortal: "转介来源门户",
        providerPortal: "服务商门户",
      },
    },
    workspace: {
      eyebrow: "转介工作区",
      title: "建立清晰的转介资料",
      description:
        "在一个试点工作区中查看自行提交的资料字段、准备度信号、受限材料和访问状态。",
      requestAccess: "申请访问权限",
      accessRequests: "访问申请",
      routeBlockTitle: "工作区路径暂不可用",
      routeBlockDescription:
        "在转介资料流程准备期间，此试点路径会保持受限。",
      plannedRoutesTitle: "计划中的工作区路径",
      plannedRoutesDescription:
        "这些链接展示资料编辑、准备度审核、引导式材料预览、访问码输入和试点访问管理的预期导航。",
      adminAccessQueue: "管理访问队列",
      routes: {
        profile: {
          label: "资料",
          detail: "编辑自行提交的转介沟通字段。",
        },
        health: {
          label: "准备度",
          detail: "查看完整度信号和优先缺口。",
        },
        materials: {
          label: "材料",
          detail: "预览分享卡、交接文案和接收提示。",
        },
        access: {
          label: "访问",
          detail: "申请或输入访问码以使用引导式起草。",
        },
      },
    },
    profile: {
      eyebrow: "资料基础",
      title: "转介资料",
      description:
        "整理身份、服务范围、接收转介信息和发送转介信息，同时避免暗示批准或背书。",
      identitySection: "身份",
      footprintSection: "服务范围",
      receiveSection: "接收转介",
      sendSection: "发送转介",
      roleMatrixTitle: "转介角色矩阵",
      noPersistence: "此处显示的更改仅供预览，不会保存到实时服务商记录。",
      builderExample: "构建器示例",
      builderDescription:
        "此处使用 Harbour 种子数据展示第一版资料构建器。本切片中的字段为只读，且不会保存更改。",
      formLabel: "只读转介资料构建器",
      relevantToProfile: "与此资料相关",
      notUsedForDirection: "此方向不使用",
      relevant: "相关",
      notUsed: "不使用",
      identityDescription:
        "设置资料代表的主体、参与转介的方式，以及转介方可阅读的自行提交摘要。",
      footprintDescription:
        "记录资料适用地区、提交的语言，以及用于沟通准备度的转介适配说明。",
      receiveDescription: "接收侧详情与发送侧交接信息保持分开。",
      sendDescription:
        "发送侧详情说明外发转介时应携带的信息以及后续跟进方式。",
      previewBoundaryTitle: "预览和非实时边界",
      previewBoundaryDescription:
        "此页面仅使用种子资料数据。它不会保存编辑、发放访问码或执行真实账户操作。",
      roleMatrixDescription:
        "种子集合展示个人和机构资料如何接收转介、发送转介或同时执行两者，并保持资料两侧互相区分。",
      directionHelp: {
        receive:
          "接收侧资料说明转介方如何介绍个人，以及哪些信息有助于接收。",
        send: "发送侧资料说明转介交接时应携带哪些信息。",
        both: "双向资料会为每一次转介沟通分别保留接收和发送详情。",
      },
      fields: {
        entityType: "主体类型",
        profileName: "资料名称",
        referralDirection: "转介方向",
        lastUpdated: "最后更新",
        profileSummary: "资料摘要",
        serviceAreas: "服务范围",
        languages: "语言",
        referralFitNotes: "转介适配说明",
        intakeMethod: "接收方式",
        responseTime: "回应时间",
        capacityStatus: "可接收情况",
        handoverRequirements: "交接要求",
        followUpCadence: "跟进节奏",
        consentReminder: "同意提醒",
      },
      tableColumns: {
        profile: "资料",
        entityType: "主体类型",
        referralDirection: "转介方向",
        receiveSide: "接收侧",
        sendSide: "发送侧",
      },
      receiveDetailsMissing: "尚未提供接收详情。",
      receiveNotUsed: "接收字段单独保留，此方向不使用。",
      sendNotUsed: "发送字段单独保留，此方向不使用。",
    },
    health: {
      eyebrow: "准备度健康",
      title: "资料准备度",
      description:
        "检查提交的资料是否足够清晰以支持转介沟通，但不评分质量、适用性或合规性。",
      scoreMeaningTitle: "分数含义",
      scoreMeaning:
        "该分数仅反映沟通完整度和清晰度，不是服务商质量评估、临床评估、合规评估或结果预测。",
      profileBuilder: "资料构建器",
      materialsPreview: "材料预览",
      metrics: {
        signalsReviewed: {
          label: "已检查信号",
          detail: "检查资料字段的沟通完整度。",
        },
        openIssues: {
          label: "未解决问题",
          detail: "按优先级排序的此资料缺口。",
        },
        highPriority: {
          label: "高优先级",
          detail: "在依赖该资料进行转介沟通前需要处理的项目。",
        },
      },
      nextStepFlowTitle: "下一步流程",
      nextStepFlowDescription:
        "使用审核结果选择需要更新的内容，然后查看预览材料和访问申请页面。",
      nextSteps: {
        profile: {
          label: "资料构建器",
          detail: "查看影响转介沟通准备度的自行提交字段。",
        },
        materials: {
          label: "材料预览",
          detail: "根据当前字段预览资料文案、分享卡和接收提示。",
        },
        access: {
          label: "访问申请",
          detail:
            "查看试点访问申请状态。此处不会进行实时提交或引导式起草。",
        },
      },
    },
    materials: {
      eyebrow: "转介材料",
      title: "引导式材料",
      description:
        "预览基于提交字段生成的资料摘要、转介消息、交接提示和分享卡文案。",
      freeMode: "免费模式显示结构和锁定预览，不调用 AI 起草操作。",
      accessMode: "访问码模式会在配额和试点限制内解锁引导式起草。",
      noAiCall: "仅预览模式不会调用 AI，也不会发送实时转介操作。",
      currentModeTitle: "当前材料模式",
      accessCodeGuidedPreview: "访问码引导预览",
      freePreviewWithoutCode: "无访问码免费预览",
      accessModeDetail:
        "此演示路径使用已批准的访问状态，因此可以看到引导式起草步骤、解锁材料和配额状态。",
      freeModeDetail:
        "此路径显示默认免费状态：材料预览可见，而引导式起草仍受访问码限制。",
      userApproved: "已批准用户",
      userFree: "免费用户",
      accessCode: "访问码",
      activeForDemo: "演示中已启用",
      notPresent: "未提供",
      guidedQuota: "引导配额",
      usedDailyQuota: "已用 {used} / 每日 {total}",
      remainingToday: "今日剩余",
      viewFreePreview: "查看免费预览",
      accessRequestPreview: "访问申请预览",
      tryAccessCodeDemo: "试用访问码演示",
      readinessAudit: "准备度审核",
      freePreview: "免费预览",
      accessDemo: "访问演示",
      access: "访问",
      deterministicPreviewTitle: "确定性界面预览",
      guidedReviewBoundary:
        "访问码审核可见引导步骤，但未来起草的任何材料仍由用户审核和控制。",
      freePreviewBoundary:
        "免费预览会显示材料要求，并明确展示访问码限制的位置。",
      accessStateBoundary:
        "访问状态不表示背书、认证、临床审核、合规批准或任何转介结果保证。",
    },
    access: {
      eyebrow: "访问控制",
      title: "试点访问",
      description: "访问码在试点期间控制引导式材料和每日配额。",
      disabledSubmit: "此预览中提交功能已禁用，申请只能由试点管理员审核。",
      costControlTitle: "成本控制",
      costControl:
        "访问门槛会将 AI 辅助起草限制在明确的试点批准和每日使用限制之内。",
      materialsDemo: "材料演示",
      adminQueue: "管理队列",
      costControlItems: [
        "通过较小的每日引导式起草配额控制 AI 成本。",
        "减少滥用、多账户抓取和自动化提取试点材料。",
        "在审核和支持流程准备好之前，保持第一阶段试点为邀请制。",
      ],
      applicationFieldsTitle: "申请字段",
      applicationFieldsDescription:
        "这些禁用字段展示第一版访问码申请可能为试点审核收集的内容。它们是种子预览值，不是已提交表单数据。",
      previewOnlyNoSubmit: "仅预览：不提交",
      formLabel: "访问码申请预览",
      fields: {
        profile: "资料",
        entityType: "主体类型",
        referralDirection: "转介方向",
        requestedCodeType: "申请的代码类型",
        sourceInvite: "来源/邀请",
        expectedDailyQuota: "预计每日配额",
        reason: "原因",
        abuseCostControlNote: "滥用和成本控制说明",
      },
      fieldValues: {
        sourceInvite: "来自转介工作区试点的邀请",
        expectedDailyQuota: "每日 {count} 次引导式起草操作",
        reason:
          "根据已提交的资料详情准备引导式转介沟通材料，同时让预览内容与实时生成保持清晰区分。",
        abuseCostControlNote:
          "访问码会限制引导式起草配额，减少自动抓取或多账户滥用，并保持 v0.1 试点为邀请制。",
      },
      previewRequestStateTitle: "预览申请状态",
      previewRequestStateDescription:
        "此页面不会创建访问申请、发送电子邮件、调用 OpenAI 或加入管理审核队列。它只预览第一版申请界面。",
      disabledButton: "仅预览 - 申请未提交",
      viewAccessCodeMaterialsDemo: "查看访问码材料演示",
      openAdminQueue: "打开管理队列",
      previewDestinationsTitle: "预览目标",
      previewDestinationsDescription:
        "使用这些链接比较无代码材料预览、访问码材料演示和种子管理队列，而不改变实时访问状态。",
      freeMaterials: "免费材料",
      accessCodeDemo: "访问码演示",
    },
    admin: {
      eyebrow: "试点管理",
      title: "访问申请审核",
      description: "查看试点工作区中的访问申请、代码类型和资料上下文。",
      boundary:
        "管理审核仅用于试点访问控制。CaresLink 不评估服务商质量、临床适用性、合规状态或服务结果，也不提供专业建议。",
      accessPreview: "访问预览",
      workspace: "工作区",
      metrics: {
        queued: {
          label: "排队中",
          detail: "等待访问审核的申请。",
        },
        accessActive: {
          label: "访问已启用",
          detail: "当前已启用访问的模拟记录。",
        },
        declined: {
          label: "已拒绝",
          detail: "模拟队列中未授予访问权限的申请。",
        },
        directionMix: {
          label: "方向组合",
        },
      },
      noRequestsInQueue: "队列中没有申请。",
      requestCount: {
        one: "{count} 个申请",
        other: "{count} 个申请",
      },
      statusLabels: {
        queued: "排队中",
        approved: "访问已启用",
        declined: "已拒绝",
      },
      directionLabels: {
        receive: "接收转介",
        send: "发送转介",
        both: "接收并发送转介",
      },
      directionSummaryLabels: {
        receive: "接收",
        send: "发送",
        both: "双向",
      },
      boundaryTitle: "访问审核边界",
      requestQueueTitle: "申请队列",
      requestQueueDescription:
        "在未来于此模拟之外应用任何访问决定前，先查看已提交的资料上下文。",
      requestFrom: "申请 {requestId}，来自 {userId}",
      fields: {
        userId: "用户 ID",
        requestedCodeType: "申请的代码类型",
        referralDirection: "转介方向",
        requestedTime: "申请时间",
        noteOrReason: "说明或原因",
      },
      reviewAffordancesTitle: "只读审核控件",
      reviewAffordancesDescription:
        "仅提供禁用的预览控件。此处不会生成访问码、改变配额或发送通知。",
      previewActionTitle:
        "仅预览。此模拟不会改变访问、配额、代码或通知。",
      previewActions: {
        approve: "预览批准",
        waitlist: "预览排队",
        decline: "预览拒绝",
      },
      requestedCodeTypesTitle: "申请的代码类型",
      noRequestedCodeTypes: "此队列中没有申请的代码类型。",
      reviewFocusTitle: "审核重点",
      reviewFocusItems: [
        "确认申请的试点代码类型和转介方向。",
        "访问前检查邀请来源和预计配额使用。",
        "留意重复申请、重复用户或多账户滥用模式。",
        "不要在此访问队列中判断服务商质量、结果、临床适用性或合规性。",
      ],
    },
    components: {
      basicProfile: {
        serviceArea: "服务范围",
        languages: "语言",
        emptyPlaceholder: "尚未提供",
        descriptionNeedsReview: "自行提交的资料摘要需要审核后才能显示。",
        footer: "基于自行提交的信息生成。不是服务商背书。",
        entityLabels: {
          individual: "个人",
          organisation: "机构",
        },
        directionLabels: {
          receive: "接收转介",
          send: "发送转介",
          both: "接收并发送转介",
        },
      },
      healthScore: {
        heading: "转介沟通分数",
        summary: "此审核仅衡量转介沟通准备度，不评估服务商质量。",
        note: "此审核仅衡量转介沟通准备度，不评估服务商质量。",
        defaultRecommendation: "分享前请保持转介资料详情为最新。",
        bandLabels: {
          "Communication profile not ready": "沟通资料尚未准备好",
          "Communication profile needs work": "沟通资料需要完善",
          "Communication profile nearly ready": "沟通资料接近准备就绪",
          "Strong communication profile": "沟通资料较完整",
        },
      },
      healthSignals: {
        heading: "准备度信号",
        description: "字段级信号用于查看转介沟通资料的完整度。",
        columns: {
          signal: "信号",
          detail: "详情",
          points: "分数",
          status: "状态",
        },
        statusLabels: {
          good: "完整",
          warning: "需要补充",
          high: "缺失",
        },
        signals: {
          entity_type: {
            label: "主体类型",
            detail: "显示该资料代表个人还是机构。",
          },
          referral_direction: {
            label: "转介方向",
            detail: "显示该资料是接收、发送，还是两者都包含。",
          },
          service_area: {
            label: "服务范围",
            detail: "说明哪些地区的转介较相关。",
          },
          languages: {
            label: "语言",
            detail: "在转介前设定语言沟通预期。",
          },
          intake_method: {
            label: "接收方式",
            detail: "说明接收侧转介应如何进入。",
          },
          response_time: {
            label: "回应时间",
            detail: "设定转介确认的时间预期。",
          },
          capacity_status: {
            label: "可接收情况",
            detail: "传达当前接收侧是否有可用名额。",
          },
          best_fit: {
            label: "适合对象",
            detail: "说明哪些转介最合适。",
          },
          handover_requirements: {
            label: "交接要求",
            detail: "说明发送转介时应附带哪些信息。",
          },
          profile_readability: {
            label: "资料可读性",
            detail: "补充清晰的自行提交资料摘要，作为转介沟通上下文。",
          },
        },
      },
      topIssues: {
        heading: "重点问题",
        description: "转介沟通资料中的优先缺口。",
        countLabel: {
          one: "{count} 项",
          other: "{count} 项",
        },
        priorityLabels: {
          high: "高优先级",
          warning: "需要补充",
        },
        emptyTitle: "暂无重点问题",
        emptyDetail: "当前资料审核未发现重点沟通缺口。",
        issues: {
          missing_entity_type: {
            label: "主体类型",
            title: "主体类型缺失",
            guidance: "显示该资料代表个人还是机构。",
          },
          partial_entity_type: {
            label: "主体类型",
            title: "主体类型需要补充",
            guidance: "显示该资料代表个人还是机构。",
          },
          missing_referral_direction: {
            label: "转介方向",
            title: "转介方向缺失",
            guidance: "显示该资料是接收、发送，还是两者都包含。",
          },
          partial_referral_direction: {
            label: "转介方向",
            title: "转介方向需要补充",
            guidance: "显示该资料是接收、发送，还是两者都包含。",
          },
          missing_service_area: {
            label: "服务范围",
            title: "服务范围缺失",
            guidance: "说明哪些地区的转介较相关。",
          },
          partial_service_area: {
            label: "服务范围",
            title: "服务范围需要补充",
            guidance: "说明哪些地区的转介较相关。",
          },
          missing_languages: {
            label: "语言",
            title: "语言缺失",
            guidance: "在转介前设定语言沟通预期。",
          },
          partial_languages: {
            label: "语言",
            title: "语言需要补充",
            guidance: "在转介前设定语言沟通预期。",
          },
          missing_intake_method: {
            label: "接收方式",
            title: "接收方式缺失",
            guidance: "说明首选的转介入口，例如表单、电子邮件或电话交接。",
          },
          partial_intake_method: {
            label: "接收方式",
            title: "接收方式需要补充",
            guidance: "说明首选的转介入口，例如表单、电子邮件或电话交接。",
          },
          missing_response_time: {
            label: "回应时间",
            title: "回应时间缺失",
            guidance: "设定转介确认的时间预期。",
          },
          partial_response_time: {
            label: "回应时间",
            title: "回应时间需要补充",
            guidance: "设定转介确认的时间预期。",
          },
          missing_capacity_status: {
            label: "可接收情况",
            title: "当前可接收情况缺失",
            guidance: "添加当前可用情况说明，让转介方知道是否可以发送新咨询。",
          },
          partial_capacity_status: {
            label: "可接收情况",
            title: "当前可接收情况需要补充",
            guidance: "添加当前可用情况详情，例如时间、限制或下次更新日期。",
          },
          missing_best_fit: {
            label: "适合对象",
            title: "适合对象缺失",
            guidance: "说明哪些转介最合适。",
          },
          partial_best_fit: {
            label: "适合对象",
            title: "适合对象需要补充",
            guidance: "说明哪些转介最合适。",
          },
          missing_handover_requirements: {
            label: "交接要求",
            title: "交接要求缺失",
            guidance: "列出转介介绍前需要提供的信息。",
          },
          partial_handover_requirements: {
            label: "交接要求",
            title: "交接要求需要补充",
            guidance: "列出转介介绍前需要提供的信息。",
          },
          missing_profile_readability: {
            label: "资料可读性",
            title: "资料摘要需要检查",
            guidance: "补充清晰的自行提交资料摘要，作为转介沟通上下文。",
          },
          partial_profile_readability: {
            label: "资料可读性",
            title: "资料摘要需要补充",
            guidance: "补充清晰的自行提交资料摘要，作为转介沟通上下文。",
          },
          unsafe_profile_readability: {
            label: "资料可读性",
            title: "资料摘要需要检查",
            guidance:
              "修改自行提交的资料摘要，移除验证、背书、结果、临床适用性或合规状态声明。",
          },
        },
      },
      materialsGrid: {
        heading: "引导式材料",
        description: "引导式起草锁定时，预览文字仍可查看。",
        guidedAvailable: "可使用引导式起草",
        readyMessage: "可根据已提交的资料详情进行引导式起草。",
        noMaterialsTitle: "未配置材料",
        noMaterialsDetail:
          "当资料包含接收或发送方向时，材料会显示在这里。",
        directionLabels: {
          receive: "接收",
          send: "发送",
        },
        lockedStatusLabels: {
          quotaUsed: "今日配额已用完",
          waitlist: "访问申请排队中",
          accessRequired: "需要访问码",
        },
        lockedMessages: {
          quotaUsed: "今日引导式配额已用完。预览仍可查看。",
          waitlist: "访问申请排队中。申请待处理期间预览仍可查看。",
          accessRequired: "需要访问码才能使用引导式材料。",
        },
        materials: {
          provider_profile: {
            label: "服务商资料",
            description: "供转介方查看的结构化接收侧资料。",
            preview: "服务范围、语言、接收方式和可用情况。",
          },
          bilingual_intro: {
            label: "双语介绍",
            description: "用于多语言分享的简明介绍文案。",
            preview: "简短的英文和社区语言资料介绍。",
          },
          share_card: {
            label: "分享卡片",
            description: "用于清晰转介沟通的简洁资料卡。",
            preview: "名称、适合对象、地区、联系路径和访问说明。",
          },
          referral_partner_message: {
            label: "转介伙伴消息",
            description: "用于向转介方介绍资料的引导式消息。",
            preview: "转介上下文、适合对象摘要和下一步提示。",
          },
          intake_checklist: {
            label: "接收清单",
            description: "用于一致接收转介的接收侧清单。",
            preview: "同意、需求、紧急程度、语言和跟进详情。",
          },
          referral_source_profile: {
            label: "转介来源资料",
            description: "用于服务商介绍的结构化发送侧资料。",
            preview: "转介角色、客户上下文和沟通偏好。",
          },
          provider_requirement_brief: {
            label: "服务商要求简报",
            description: "交接前服务商需要的信息简报。",
            preview: "客户目标、服务需求、时间和语言要求。",
          },
          handover_template: {
            label: "交接模板",
            description: "用于发送完整转介上下文的引导式模板。",
            preview: "同意状态、支持需求、风险和首选下一步。",
          },
          consent_reminder: {
            label: "同意提醒",
            description: "分享详情前检查同意情况的提醒模块。",
            preview: "联系服务商前确认同意范围。",
          },
          follow_up_message: {
            label: "跟进消息",
            description: "服务商交接后的简短跟进提示。",
            preview: "确认服务商是否接受、拒绝或需要更多详情。",
          },
        },
      },
      agentQueue: {
        heading: "智能队列",
        description: "引导步骤基于已提交的资料字段和访问状态。",
        readyLabel: "就绪",
        lockedBadgeLabels: {
          quotaUsed: "配额已用完",
          queued: "排队中",
          accessCode: "访问码",
        },
        items: {
          profile: {
            label: "资料助手",
            freeState: "预览基础资料结构和缺失字段。",
            accessCodeState: "根据已提交的详情引导资料措辞。",
          },
          readiness: {
            label: "准备度助手",
            freeState: "显示准备度信号和问题优先级。",
            accessCodeState: "针对转介沟通缺口建议重点修改。",
          },
          "share-card": {
            label: "分享卡助手",
            freeState: "预览锁定的分享卡材料。",
            accessCodeState: "根据已提交的资料字段准备简洁分享卡。",
          },
          "referral-message": {
            label: "转介消息助手",
            freeState: "预览转介消息要求。",
            accessCodeState: "起草供审核的引导式转介消息。",
          },
          "trust-copy": {
            label: "信任文案助手",
            freeState: "预览信任文案提示和免责声明。",
            accessCodeState: "起草供审核的简明信任文案。",
          },
        },
      },
      accessStatus: {
        heading: "访问状态",
        states: {
          active: {
            label: "访问码已启用",
            detail: "每日配额仍可用时，引导式材料可用。",
          },
          quotaUsed: {
            label: "今日配额已用完",
            detail:
              "预览材料仍可查看。配额可用后将再次解锁引导式起草。",
          },
          waitlist: {
            label: "访问申请排队中",
            detail: "访问码启用前，预览材料仍可查看。",
          },
          free: {
            label: "免费预览",
            detail: "预览材料可查看。引导式起草需要访问码。",
          },
        },
        accessCodeLabel: "访问码",
        present: "已提供",
        notPresent: "未提供",
        usedToday: "今日已用",
        remaining: "剩余",
        dailyGuidedQuota: "每日引导配额",
        codeTypeLabels: {
          "Provider Pilot": "服务商试点",
          "Referral Source Pilot": "转介来源试点",
          "Dual Role Pilot": "双向角色试点",
          "Internal Test": "内部测试",
          "Partner Batch": "合作伙伴批次",
        },
      },
      copilot: {
        heading: "引导式助手",
        description: "用于资料起草提示的右侧工作区。",
        profileContextLabel: "资料上下文",
        readinessContextLabel: "准备度上下文",
        guidedStepLabel: "引导步骤",
        previewStepLabel: "预览步骤",
        accessBoundaryLabel: "访问边界",
        noProfileContext: "选择资料后会显示已提交的转介上下文。",
        readinessScore: "当前分数为 {score}/100。",
        noQueueItem: "配置引导流程后，队列项会显示在这里。",
        draftingPromptReady: "起草提示已就绪",
        boundaryMessages: {
          quotaUsed: "今日引导式配额已用完。预览材料仍可查看。",
          waitlist:
            "访问申请排队中。申请待处理期间预览材料仍可查看。",
          accessRequired:
            "需要访问码才能使用引导式起草。预览材料仍可查看。",
        },
      },
    },
  },
};

export function isSupportedLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}

export function getLocaleFromSearchParams(
  searchParams: ReferralWorkspaceSearchParams,
): Locale {
  const locale = getSearchParamValue(searchParams);

  return locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function getReferralWorkspaceCopy(
  locale: Locale,
): ReferralWorkspaceCopy {
  return referralWorkspaceCopy[locale];
}

export function getLocaleLabel(locale: Locale): string {
  return localeLabels[locale];
}

export function withLocale(href: string, locale: Locale): string {
  const [hrefWithoutHash, hash] = href.split("#", 2);
  const [pathname, query = ""] = hrefWithoutHash.split("?", 2);
  const queryParams = new URLSearchParams(query);

  queryParams.set(LOCALE_QUERY_PARAM, locale);

  const localizedHref = `${pathname}?${queryParams.toString()}`;

  return hash === undefined ? localizedHref : `${localizedHref}#${hash}`;
}

function getSearchParamValue(
  searchParams: ReferralWorkspaceSearchParams,
): string | undefined {
  if (!searchParams) {
    return undefined;
  }

  if ("get" in searchParams && typeof searchParams.get === "function") {
    return searchParams.get(LOCALE_QUERY_PARAM) ?? undefined;
  }

  const indexedParams = searchParams as {
    readonly [key: string]: string | readonly string[] | undefined;
  };
  const value = indexedParams[LOCALE_QUERY_PARAM];

  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === "string" ? value : undefined;
}

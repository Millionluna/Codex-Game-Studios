import { createHash, randomBytes } from "node:crypto";
import type { NdisCaseNoteQuotaScope } from "./ndis-case-note-companion-store";

export {
  buildNdisCaseNoteCompanionHref,
  getNdisCaseNoteCompanionAttribution,
  NDIS_CASE_NOTE_COMPANION_PATH,
  NDIS_CASE_NOTE_COMPANION_SOURCE,
  NDIS_CASE_NOTE_RESOURCE_SLUG,
  NDIS_CASE_NOTE_UTM_CAMPAIGN,
} from "./ndis-case-note-companion-navigation";

export const NDIS_CASE_NOTE_COMPANION_SESSION_COOKIE =
  "careslink_ndis_companion_session";

export type NdisCaseNoteRequestIdentity = {
  sessionId: string;
  isNewSession: boolean;
  deviceHash: string;
  ipHash: string;
  visitorHash: string;
};

export type NdisCaseNoteQuotaReservation = {
  scope: NdisCaseNoteQuotaScope;
  fingerprintHash: string;
  usageDate: string;
};

type RequestIdentityEnv = {
  NDIS_CASE_NOTE_FINGERPRINT_PEPPER?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  NODE_ENV?: string;
};

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{24,100}$/;

export function getNdisCaseNoteRequestIdentity(
  request: Pick<Request, "headers">,
  env: RequestIdentityEnv = process.env as RequestIdentityEnv,
): NdisCaseNoteRequestIdentity {
  const cookieSessionId = getCookieValue(
    request.headers.get("cookie"),
    NDIS_CASE_NOTE_COMPANION_SESSION_COOKIE,
  );
  const sessionId =
    cookieSessionId && SESSION_ID_PATTERN.test(cookieSessionId)
      ? cookieSessionId
      : randomBytes(24).toString("base64url");
  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? "";
  const pepper = getFingerprintPepper(env);
  const ipHash = hashFingerprint(`ip:${ip}`, pepper);
  const deviceHash = hashFingerprint(
    `device:${ip}:${userAgent}:${sessionId}`,
    pepper,
  );

  return {
    sessionId,
    isNewSession: sessionId !== cookieSessionId,
    deviceHash,
    ipHash,
    visitorHash: hashFingerprint(`visitor:${sessionId}`, pepper),
  };
}

export function getNdisCaseNoteUsageDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function hashAuthenticatedCompanionUser(
  userId: string,
  env: RequestIdentityEnv = process.env as RequestIdentityEnv,
) {
  const pepper = getFingerprintPepper(env);

  return hashFingerprint(`user:${userId}`, pepper);
}

function getClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  const firstForwardedIp = forwarded?.split(",")[0]?.trim();

  return (
    firstForwardedIp ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    "local"
  ).slice(0, 100);
}

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const [cookieName, ...cookieValueParts] = part.trim().split("=");

    if (cookieName === name) {
      return decodeURIComponent(cookieValueParts.join("="));
    }
  }

  return undefined;
}

function hashFingerprint(value: string, pepper: string) {
  return createHash("sha256")
    .update(`${pepper}:${value}`)
    .digest("hex");
}

function getFingerprintPepper(env: RequestIdentityEnv) {
  const configured = env.NDIS_CASE_NOTE_FINGERPRINT_PEPPER?.trim();

  if (configured) {
    return configured;
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      "NDIS_CASE_NOTE_FINGERPRINT_PEPPER is required in production",
    );
  }

  return (
    env.SUPABASE_SERVICE_ROLE_KEY ??
    "careslink-ndis-companion-local"
  );
}

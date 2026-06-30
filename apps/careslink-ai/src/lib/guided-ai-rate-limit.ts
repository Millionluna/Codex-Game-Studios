export type GuidedAiRateLimitAllowed = {
  allowed: true;
  remaining: number;
  resetAt: string;
};

export type GuidedAiRateLimitDenied = {
  allowed: false;
  retryAfterSeconds: number;
  resetAt: string;
};

export type GuidedAiRateLimitResult =
  | GuidedAiRateLimitAllowed
  | GuidedAiRateLimitDenied;

export type GuidedAiRateLimiter = {
  check(key: string, now?: number): GuidedAiRateLimitResult;
};

type GuidedAiRateLimiterOptions = {
  limit: number;
  windowMs: number;
};

type GuidedAiRateLimiterEnv = {
  GUIDED_AI_RATE_LIMIT_PER_MINUTE?: string;
};

type RateLimitBucket = {
  count: number;
  resetAtMs: number;
};

const GLOBAL_GUIDED_AI_RATE_LIMITER_KEY = "__careslinkAiGuidedAiRateLimiter__";
const DEFAULT_RATE_LIMIT_PER_MINUTE = 6;
const DEFAULT_WINDOW_MS = 60_000;

type GlobalGuidedAiRateLimiter = typeof globalThis & {
  [GLOBAL_GUIDED_AI_RATE_LIMITER_KEY]?: GuidedAiRateLimiter;
};

export function createMemoryGuidedAiRateLimiter({
  limit,
  windowMs,
}: GuidedAiRateLimiterOptions): GuidedAiRateLimiter {
  const buckets = new Map<string, RateLimitBucket>();
  const normalizedLimit = clampPositiveInteger(limit, DEFAULT_RATE_LIMIT_PER_MINUTE);
  const normalizedWindowMs = clampPositiveInteger(windowMs, DEFAULT_WINDOW_MS);

  return {
    check(key, now = Date.now()) {
      const safeKey = key.trim() || "anonymous";
      const existing = buckets.get(safeKey);
      const bucket =
        existing && now < existing.resetAtMs
          ? existing
          : { count: 0, resetAtMs: now + normalizedWindowMs };

      buckets.set(safeKey, bucket);

      if (bucket.count >= normalizedLimit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((bucket.resetAtMs - now) / 1000),
          ),
          resetAt: new Date(bucket.resetAtMs).toISOString(),
        };
      }

      bucket.count += 1;

      return {
        allowed: true,
        remaining: Math.max(0, normalizedLimit - bucket.count),
        resetAt: new Date(bucket.resetAtMs).toISOString(),
      };
    },
  };
}

export function getGuidedAiRateLimiter(
  env: GuidedAiRateLimiterEnv = process.env as GuidedAiRateLimiterEnv,
): GuidedAiRateLimiter {
  const globalScope = globalThis as GlobalGuidedAiRateLimiter;
  globalScope[GLOBAL_GUIDED_AI_RATE_LIMITER_KEY] ??=
    createMemoryGuidedAiRateLimiter({
      limit: getRateLimitPerMinute(env),
      windowMs: DEFAULT_WINDOW_MS,
    });

  return globalScope[GLOBAL_GUIDED_AI_RATE_LIMITER_KEY];
}

function getRateLimitPerMinute(env: GuidedAiRateLimiterEnv) {
  const parsed = Number.parseInt(env.GUIDED_AI_RATE_LIMIT_PER_MINUTE ?? "", 10);

  return Number.isFinite(parsed) ? parsed : DEFAULT_RATE_LIMIT_PER_MINUTE;
}

function clampPositiveInteger(value: number, fallback: number) {
  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }

  return Math.trunc(value);
}

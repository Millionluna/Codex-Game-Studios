type SupabasePasswordAuthClient = {
  auth: {
    signInWithPassword(input: {
      email: string;
      password: string;
    }): Promise<{
      data?: {
        user?: {
          app_metadata?: Record<string, unknown>;
        } | null;
      };
      error: { message?: string } | null;
    }>;
    signUp(input: {
      email: string;
      password: string;
      options: {
        data: {
          name: string;
          careslink_signup_role: "provider";
        };
      };
    }): Promise<{
      data: { session: unknown | null };
      error: { message?: string } | null;
    }>;
  };
};

type RedirectFunction = (href: string) => unknown;

export type ReferralWorkspaceAuthActionState =
  | {
      status: "idle";
      message?: undefined;
    }
  | {
      status: "success" | "error";
      message: string;
    };

type PasswordSignInInput = {
  email: string;
  password: string;
  next?: string;
  locale?: string;
  authClient: SupabasePasswordAuthClient;
  redirect: RedirectFunction;
};

type PasswordSignUpInput = PasswordSignInInput & {
  name: string;
};

const defaultWorkspaceRedirectHref = "/referral-workspace/profile";
const adminWorkspaceRedirectHref = "/referral-workspace";
const providerAllowedRedirectPrefixes = ["/referral-workspace"];
const adminAllowedRedirectPrefixes = [
  "/referral-workspace",
  "/admin/access-requests",
  "/admin/material-usage",
];
type AuthRedirectRole = "provider" | "admin";

export function getSafeAuthRedirectHref(
  next?: string,
  locale?: string,
  role: AuthRedirectRole = "provider",
): string {
  const rawNext = next?.trim();
  const safePath = isSafeInternalWorkspaceHref(rawNext, role)
    ? rawNext
    : getDefaultAuthRedirectHref(role);

  return appendLocale(safePath, locale);
}

export async function signInWithPasswordForWorkspace({
  email,
  password,
  next,
  locale,
  authClient,
  redirect,
}: PasswordSignInInput): Promise<ReferralWorkspaceAuthActionState> {
  const normalizedEmail = email.trim();

  if (!normalizedEmail || !password) {
    return {
      status: "error",
      message: "Email and password are required.",
    };
  }

  const { data, error } = await authClient.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    return {
      status: "error",
      message: error.message ?? "Unable to sign in.",
    };
  }

  redirect(getSafeAuthRedirectHref(next, locale, getRoleFromSignInUser(data?.user)));

  return {
    status: "success",
    message: "Signed in.",
  };
}

export async function signUpWithPasswordForWorkspace({
  name,
  email,
  password,
  next,
  locale,
  authClient,
  redirect,
}: PasswordSignUpInput): Promise<ReferralWorkspaceAuthActionState> {
  const normalizedName = name.trim();
  const normalizedEmail = email.trim();

  if (!normalizedName || !normalizedEmail || !password) {
    return {
      status: "error",
      message: "Name, email and password are required.",
    };
  }

  const { data, error } = await authClient.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        name: normalizedName,
        careslink_signup_role: "provider",
      },
    },
  });

  if (error) {
    return {
      status: "error",
      message: error.message ?? "Unable to create account.",
    };
  }

  if (data.session) {
    redirect(getSafeAuthRedirectHref(next, locale, "provider"));

    return {
      status: "success",
      message: "Account created.",
    };
  }

  return {
    status: "success",
    message: "Check your email to confirm your CaresLink AI account.",
  };
}

function getDefaultAuthRedirectHref(role: AuthRedirectRole) {
  return role === "admin"
    ? adminWorkspaceRedirectHref
    : defaultWorkspaceRedirectHref;
}

function isSafeInternalWorkspaceHref(
  href: string | undefined,
  role: AuthRedirectRole,
): href is string {
  if (!href || !href.startsWith("/") || href.startsWith("//")) {
    return false;
  }

  try {
    const parsed = new URL(href, "https://careslink.local");

    if (parsed.origin !== "https://careslink.local") {
      return false;
    }

    const allowedRedirectPrefixes =
      role === "admin"
        ? adminAllowedRedirectPrefixes
        : providerAllowedRedirectPrefixes;

    return allowedRedirectPrefixes.some((prefix) =>
      parsed.pathname.startsWith(prefix),
    );
  } catch {
    return false;
  }
}

function getRoleFromSignInUser(
  user:
    | {
        app_metadata?: Record<string, unknown>;
      }
    | null
    | undefined,
): AuthRedirectRole {
  const role = user?.app_metadata?.careslink_role ?? user?.app_metadata?.role;

  return role === "admin" ? "admin" : "provider";
}

function appendLocale(href: string, locale?: string) {
  const normalizedLocale = locale?.trim();

  if (!normalizedLocale) {
    return href;
  }

  const parsed = new URL(href, "https://careslink.local");

  if (!parsed.searchParams.has("lang")) {
    parsed.searchParams.set("lang", normalizedLocale);
  }

  const hash = parsed.hash;

  return `${parsed.pathname}${parsed.search}${hash}`;
}

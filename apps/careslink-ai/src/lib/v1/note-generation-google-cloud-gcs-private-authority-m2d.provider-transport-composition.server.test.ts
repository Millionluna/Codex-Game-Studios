import type { LookupAddress, LookupOptions } from "node:dns";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const compositionMocks = vi.hoisted(() => ({
  createGcsTransport: vi.fn(),
  dnsLookup: vi.fn(),
  getVercelOidcTokenSync: vi.fn(),
  httpsRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@vercel/oidc", () => ({
  getVercelOidcTokenSync: compositionMocks.getVercelOidcTokenSync,
}));
vi.mock("node:dns", () => ({ lookup: compositionMocks.dnsLookup }));
vi.mock("node:https", () => ({ request: compositionMocks.httpsRequest }));
vi.mock(
  "./note-generation-google-cloud-gcs-https-transport-m2d.server",
  () => ({
    createCaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportM2d:
      compositionMocks.createGcsTransport,
  }),
);

import {
  prepareTestOnlyCaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d,
} from "./note-generation-google-cloud-gcs-private-authority-m2d.server";
import {
  createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b,
} from "./note-generation-google-cloud-provider-https-transport-m2b.server";

const NOW = new Date("2026-09-04T00:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const FIXED_FAILURE = Object.freeze({
  code: "PRODUCT_API_DISABLED",
  message:
    "Communication Note Google Cloud GCS private authority is unavailable",
});
const REJECTED_IANA_IPV6_ADDRESSES = Object.freeze([
  "2001:2::1",
  "3fff::1",
]);

type LookupAllCallback = (
  error: NodeJS.ErrnoException | null,
  addresses: LookupAddress[],
) => void;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  compositionMocks.createGcsTransport.mockReset();
  compositionMocks.dnsLookup.mockReset();
  compositionMocks.getVercelOidcTokenSync.mockReset();
  compositionMocks.httpsRequest.mockReset();
  compositionMocks.getVercelOidcTokenSync.mockReturnValue(baseOidcToken());
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Communication Note M2d authority with the real M2b provider transport", () => {
  it.each(REJECTED_IANA_IPV6_ADDRESSES)(
    "fails closed before HTTPS when the first Vercel profile resolves to %s",
    async (address) => {
      const observedHostnames: string[] = [];
      compositionMocks.dnsLookup.mockImplementation(
        (
          hostname: string,
          options: LookupOptions,
          callback: LookupAllCallback,
        ) => {
          observedHostnames.push(hostname);
          expect(options).toEqual({ all: true, verbatim: true });
          callback(null, [{ address, family: 6 }]);
        },
      );
      const root = new AbortController();

      await expect(
        prepareTestOnlyCaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d(
          Object.freeze({
            capability: "TEST_ONLY_M2D_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY",
            bucket: "careslink-preview-private-notes",
            objectPrefix: "communication-notes/v1",
            rootAbortSignal: root.signal,
          }),
        ),
      ).rejects.toEqual(FIXED_FAILURE);

      expect(
        vi.isMockFunction(
          createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b,
        ),
      ).toBe(false);
      expect(compositionMocks.getVercelOidcTokenSync).toHaveBeenCalledTimes(1);
      expect(observedHostnames).toEqual(["oidc.vercel.com"]);
      expect(compositionMocks.dnsLookup).toHaveBeenCalledTimes(1);
      expect(compositionMocks.httpsRequest).not.toHaveBeenCalled();
      expect(compositionMocks.createGcsTransport).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

function baseOidcToken() {
  return jwt({
    iss: "https://oidc.vercel.com/millionlunas-projects",
    sub: "owner:millionlunas-projects:project:careslink-ai:environment:preview",
    aud: "https://vercel.com/millionlunas-projects",
    owner_id: "team_cFWfAk6zAa0b7X5bc1ONT4SA",
    owner: "millionlunas-projects",
    project_id: "prj_AtdTukVr39wrGH9PYgKusfku2gvS",
    project: "careslink-ai",
    environment: "preview",
    iat: NOW_SECONDS - 10,
    nbf: NOW_SECONDS - 10,
    exp: NOW_SECONDS + 300,
  });
}

function jwt(claims: Readonly<Record<string, unknown>>) {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key" }),
    "utf8",
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString(
    "base64url",
  );
  const signature = Buffer.from("test-only-signature-material", "utf8").toString(
    "base64url",
  );
  return `${header}.${payload}.${signature}`;
}

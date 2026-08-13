import { handleCaresLinkV1NativeAuthDisabledBoundary } from "@/lib/v1/native-auth-boundary.server";

export function POST(request: Request) {
  return handleCaresLinkV1NativeAuthDisabledBoundary(request);
}

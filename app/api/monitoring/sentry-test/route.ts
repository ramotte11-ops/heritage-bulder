import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const configuredToken = process.env.SENTRY_TEST_TOKEN;

  // The route is indistinguishable from a missing route unless both Sentry and
  // the dedicated test gate are configured for this deployment.
  if (!process.env.SENTRY_DSN || !configuredToken || !hasValidToken(request, configuredToken)) {
    return new Response(null, { status: 404 });
  }

  const eventId = Sentry.captureException(createVerificationError());
  const delivered = await Sentry.flush(2_000);

  return Response.json({ eventId, delivered }, { status: delivered ? 202 : 503 });
}

function createVerificationError(): Error {
  return new Error("HeritageSentryVerificationError");
}

function hasValidToken(request: Request, expected: string): boolean {
  const submitted = request.headers.get("x-heritage-sentry-test-token");
  if (!submitted) return false;

  const submittedBytes = Buffer.from(submitted);
  const expectedBytes = Buffer.from(expected);
  return (
    submittedBytes.length === expectedBytes.length && timingSafeEqual(submittedBytes, expectedBytes)
  );
}

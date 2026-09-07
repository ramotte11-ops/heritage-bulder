import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { completeEtsyClaim } from "@/lib/integration/etsy/etsy-session";

/**
 * Mission 019B — the return leg of the buyer's Etsy handshake.
 *
 * A Route Handler rather than a Server Action because this is a
 * top-level GET navigation coming back from etsy.com with a query
 * string; a Server Action cannot receive one. It renders nothing: it
 * validates, claims, and redirects.
 *
 * ## What is allowed into the redirect URL, and what is not
 *
 * On success the family lands on their memorial in the Builder. On every
 * refusal they land back on `/activate` carrying ONE generic word, from
 * a closed set, that says only which reassurance to show them:
 *
 *   recovery  no purchase matched this Etsy account — offer the
 *             activation key path (this is also where a guest checkout
 *             lands, and correctly so)
 *   support   something was found but cannot be claimed automatically
 *   retry     Etsy did not answer, or too many attempts
 *   failed    anything else
 *
 * Never in this URL, on any path: the OAuth code, the `state`, a token,
 * the Etsy member id, an order reference, an entitlement id, or any
 * message from Etsy or PostgreSQL. The four words above are the entire
 * vocabulary that crosses back, and none of them identifies anything.
 */

type ClaimNotice = "recovery" | "support" | "retry" | "failed";

function activateUrl(origin: string, notice: ClaimNotice): string {
  return `${origin}/activate?claim=${notice}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);

  // Read, but never echoed anywhere: `code` is a one-time credential and
  // `state` is compared server-side against an HttpOnly cookie.
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  let outcome;
  try {
    outcome = await completeEtsyClaim({ code, state });
  } catch (error) {
    unstable_rethrow(error);
    // No detail is logged: an exception raised anywhere along this path
    // may carry an Etsy response or a Supabase error, and neither may be
    // written down. The family gets the same calm ending as any other
    // refusal.
    return NextResponse.redirect(activateUrl(origin, "failed"));
  }

  switch (outcome.status) {
    case "claimed":
      // The only success. From here on the family is inside HERITAGE and
      // the Builder knows nothing about where the memorial came from.
      return NextResponse.redirect(`${origin}/builder/${outcome.memorialId}`);

    case "noMatchingPurchase":
      return NextResponse.redirect(activateUrl(origin, "recovery"));

    case "multiplePurchases":
    case "purchaseNotEligible":
      return NextResponse.redirect(activateUrl(origin, "support"));

    case "etsyUnavailable":
    case "rateLimited":
      return NextResponse.redirect(activateUrl(origin, "retry"));

    case "unauthenticated":
    case "handshakeRejected":
    case "failed":
      return NextResponse.redirect(activateUrl(origin, "failed"));
  }
}

import "server-only";

import {
  hashReviewAccessToken,
} from "@/lib/reviews/review-access";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

export type ReviewInvitationState =
  | "active"
  | "used"
  | "expired"
  | "revoked";

export async function getReviewInvitationByToken(
  token: string,
) {
  if (
    !/^[0-9a-f]{64}$/i.test(
      token,
    )
  ) {
    return null;
  }

  const supabase =
    getSupabaseAdmin();

  const tokenHash =
    hashReviewAccessToken(
      token,
    );

  const {
    data:
      invitation,

    error,
  } =
    await supabase
      .from(
        "review_invitations",
      )
      .select(
        `
          id,
          customer_name,
          service_name_snapshot,
          status,
          expires_at
        `,
      )
      .eq(
        "access_token_hash",
        tokenHash,
      )
      .maybeSingle();

  if (
    error ||
    !invitation
  ) {
    return null;
  }

  const {
    count,
  } =
    await supabase
      .from(
        "testimonials",
      )
      .select(
        "id",
        {
          count:
            "exact",

          head:
            true,
        },
      )
      .eq(
        "invitation_id",
        invitation.id,
      );

  let state:
    ReviewInvitationState;

  if (
    (count ?? 0) >
      0 ||
    invitation.status ===
      "used"
  ) {
    state =
      "used";
  } else if (
    invitation.status ===
    "revoked"
  ) {
    state =
      "revoked";
  } else if (
    invitation.expires_at &&
    new Date(
      invitation.expires_at,
    ).getTime() <=
      Date.now()
  ) {
    state =
      "expired";
  } else {
    state =
      "active";
  }

  return {
    invitation,
    state,
    tokenHash,
  };
}
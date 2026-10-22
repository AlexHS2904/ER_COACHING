import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  isActiveAdmin,
} from "@/lib/admin/is-active-admin";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

import {
  decryptIntakeToken,
} from "@/lib/intake/intake-token-crypto";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: NextRequest,
  {
    params,
  }: Props,
) {
  if (
    !(await isActiveAdmin())
  ) {
    return NextResponse.json(
      {
        error:
          "No autorizado.",
      },
      {
        status: 401,
      },
    );
  }

  const {
    id,
  } = await params;

  const supabase =
    getSupabaseAdmin();

  const {
    data: form,
  } = await supabase
    .from(
      "booking_intake_forms",
    )
    .select(
      `
        id,
        access_token_encrypted,
        status
      `,
    )
    .eq(
      "id",
      id,
    )
    .maybeSingle();

  if (
    !form ||
    !form
      .access_token_encrypted
  ) {
    return NextResponse.json(
      {
        error:
          "Formulario no encontrado.",
      },
      {
        status: 404,
      },
    );
  }

  const token =
    decryptIntakeToken(
      form
        .access_token_encrypted,
    );

  const origin =
    new URL(
      request.url,
    ).origin;

  return NextResponse.json({
    success:
      true,

    formUrl:
      new URL(
        `/formulario/${token}`,
        origin,
      ).toString(),
  });
}
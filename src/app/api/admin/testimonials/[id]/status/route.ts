import {
  revalidatePath,
} from "next/cache";

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

type Context = {
  params: Promise<{
    id: string;
  }>;
};

const ALLOWED_STATUSES =
  new Set([
    "pending",
    "approved",
    "hidden",
    "rejected",
  ]);

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: Context,
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
        status:
          401,
      },
    );
  }

  const {
    id,
  } =
    await params;

  const body =
    (await request.json()) as {
      status?: unknown;
    };

  if (
    typeof body.status !==
      "string" ||
    !ALLOWED_STATUSES.has(
      body.status,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Estado no válido.",
      },
      {
        status:
          400,
      },
    );
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data:
      testimonial,
  } =
    await supabase
      .from(
        "testimonials",
      )
      .select(
        `
          id,
          consent_to_publish,
          approved_at
        `,
      )
      .eq(
        "id",
        id,
      )
      .maybeSingle();

  if (!testimonial) {
    return NextResponse.json(
      {
        error:
          "No se encontró el testimonio.",
      },
      {
        status:
          404,
      },
    );
  }

  if (
    body.status ===
      "approved" &&
    !testimonial
      .consent_to_publish
  ) {
    return NextResponse.json(
      {
        error:
          "El cliente no autorizó la publicación.",
      },
      {
        status:
          409,
      },
    );
  }

  const {
    error,
  } =
    await supabase
      .from(
        "testimonials",
      )
      .update({
        status:
          body.status,

        approved_at:
          body.status ===
          "approved"
            ? testimonial
                .approved_at ??
              new Date()
                .toISOString()
            : null,
      })
      .eq(
        "id",
        id,
      );

  if (error) {
    return NextResponse.json(
      {
        error:
          "No fue posible actualizar el testimonio.",
      },
      {
        status:
          500,
      },
    );
  }

  revalidatePath(
    "/testimonios",
  );

  revalidatePath(
    "/admin/testimonios",
  );

  return NextResponse.json({
    success:
      true,
  });
}
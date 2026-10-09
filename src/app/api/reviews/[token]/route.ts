import {
  randomUUID,
} from "crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import sharp from "sharp";

import {
  getReviewInvitationByToken,
} from "@/lib/reviews/get-review-invitation";

import {
  isReviewAvatarKey,
} from "@/lib/reviews/avatars";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

export const runtime =
  "nodejs";

const MAX_PHOTO_BYTES =
  4 * 1024 * 1024;

const ALLOWED_MIME_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ]);

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function POST(
  request: NextRequest,
  {
    params,
  }: RouteContext,
) {
  let uploadedPhotoPath:
    | string
    | null = null;

  const supabase =
    getSupabaseAdmin();

  try {
    const {
      token,
    } =
      await params;

    /* =====================================================
       1. VALIDAR INVITACIÓN
    ===================================================== */

    const access =
      await getReviewInvitationByToken(
        token,
      );

    if (!access) {
      return NextResponse.json(
        {
          error:
            "Este enlace no es válido.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      access.state !==
      "active"
    ) {
      const message =
        access.state ===
        "used"
          ? "Este enlace ya fue utilizado."
          : access.state ===
              "expired"
            ? "Este enlace ha expirado."
            : "Este enlace ya no está disponible.";

      return NextResponse.json(
        {
          error: message,
        },
        {
          status: 410,
        },
      );
    }

    /* =====================================================
       2. LEER FORMULARIO
    ===================================================== */

    const formData =
      await request.formData();

    const authorName =
      String(
        formData.get(
          "authorName",
        ) ?? "",
      ).trim();

    const content =
      String(
        formData.get(
          "content",
        ) ?? "",
      ).trim();

    const rating =
      Number(
        formData.get(
          "rating",
        ),
      );

    const consent =
      formData.get(
        "consent",
      ) === "true";

    const identityMode =
      String(
        formData.get(
          "identityMode",
        ) ?? "",
      );

    const avatarValue =
      formData.get(
        "avatarKey",
      );

    /* =====================================================
       3. VALIDACIONES
    ===================================================== */

    if (
      authorName.length <
        2 ||
      authorName.length >
        100
    ) {
      return NextResponse.json(
        {
          error:
            "El nombre no es válido.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !Number.isInteger(
        rating,
      ) ||
      rating < 1 ||
      rating > 5
    ) {
      return NextResponse.json(
        {
          error:
            "Selecciona una calificación válida.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      content.length <
        10 ||
      content.length >
        2000
    ) {
      return NextResponse.json(
        {
          error:
            "La reseña debe tener entre 10 y 2000 caracteres.",
        },
        {
          status: 400,
        },
      );
    }

    if (!consent) {
      return NextResponse.json(
        {
          error:
            "Necesitamos tu autorización para publicar el testimonio.",
        },
        {
          status: 400,
        },
      );
    }

    let avatarKey:
      | string
      | null = null;

    let photoPath:
      | string
      | null = null;

    /* =====================================================
       4A. AVATAR
    ===================================================== */

    if (
      identityMode ===
      "avatar"
    ) {
      if (
        typeof avatarValue !==
          "string" ||
        !isReviewAvatarKey(
          avatarValue,
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Selecciona un avatar válido.",
          },
          {
            status: 400,
          },
        );
      }

      avatarKey =
        avatarValue;
    }

    /* =====================================================
       4B. FOTO
    ===================================================== */

    else if (
      identityMode ===
      "photo"
    ) {
      const value =
        formData.get(
          "photo",
        );

      if (
        !(value instanceof File) ||
        value.size === 0
      ) {
        return NextResponse.json(
          {
            error:
              "Selecciona una fotografía.",
          },
          {
            status: 400,
          },
        );
      }

      if (
        value.size >
        MAX_PHOTO_BYTES
      ) {
        return NextResponse.json(
          {
            error:
              "La fotografía debe pesar máximo 4 MB.",
          },
          {
            status: 413,
          },
        );
      }

      if (
        !ALLOWED_MIME_TYPES.has(
          value.type,
        )
      ) {
        return NextResponse.json(
          {
            error:
              "El formato de imagen no es compatible.",
          },
          {
            status: 400,
          },
        );
      }

      let optimized:
        Buffer;

      try {
        const input =
          Buffer.from(
            await value.arrayBuffer(),
          );

        optimized =
          await sharp(
            input,
            {
              failOn:
                "error",

              limitInputPixels:
                40_000_000,
            },
          )
            .rotate()

            .resize({
              width: 640,
              height: 640,

              fit:
                "cover",

              position:
                sharp.strategy
                  .attention,

              withoutEnlargement:
                true,
            })

            .webp({
              quality: 80,
              effort: 4,
            })

            .toBuffer();
      } catch (
        imageError
      ) {
        console.error(
          "Image processing error:",
          imageError,
        );

        return NextResponse.json(
          {
            error:
              "No pudimos procesar esa fotografía. Intenta con JPG, PNG o WebP.",
          },
          {
            status: 400,
          },
        );
      }

      /* ===================================================
         5. GUARDAR SOLO WEBP
      =================================================== */

      photoPath =
        `${
          access
            .invitation
            .id
        }/${randomUUID()}.webp`;

      const {
        error:
          uploadError,
      } =
        await supabase
          .storage
          .from(
            "testimonial-photos",
          )
          .upload(
            photoPath,
            optimized,
            {
              contentType:
                "image/webp",

              cacheControl:
                "31536000",

              upsert:
                false,
            },
          );

      if (
        uploadError
      ) {
        console.error(
          "Testimonial photo upload error:",
          uploadError,
        );

        return NextResponse.json(
          {
            error:
              "No fue posible guardar la fotografía.",
          },
          {
            status: 500,
          },
        );
      }

      uploadedPhotoPath =
        photoPath;
    }

    /* =====================================================
       4C. OPCIÓN INVÁLIDA
    ===================================================== */

    else {
      return NextResponse.json(
        {
          error:
            "Selecciona una fotografía o un avatar.",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       6. CREAR TESTIMONIO

       PostgreSQL:
       - vuelve a validar el token
       - bloquea la invitación
       - crea la reseña
       - marca el enlace como usado
    ===================================================== */

    const {
      data,
      error,
    } =
      await supabase.rpc(
        "submit_testimonial",
        {
          p_access_token_hash:
            access.tokenHash,

          p_author_name:
            authorName,

          p_rating:
            rating,

          p_content:
            content,

          p_consent_to_publish:
            consent,

          p_avatar_key:
            avatarKey,

          p_photo_path:
            photoPath,
        },
      );

    if (
      error ||
      !data?.[0]
    ) {
      /*
        Si ya habíamos subido una
        fotografía pero PostgreSQL
        rechaza la reseña, la eliminamos.
      */

      if (
        uploadedPhotoPath
      ) {
        await supabase
          .storage
          .from(
            "testimonial-photos",
          )
          .remove([
            uploadedPhotoPath,
          ]);
      }

      console.error(
        "Submit testimonial error:",
        error,
      );

      const message =
        error?.message ??
        "No fue posible guardar la reseña.";

      const used =
        message.includes(
          "utilizado",
        ) ||
        message.includes(
          "ya no está disponible",
        ) ||
        message.includes(
          "Ya existe",
        );

      return NextResponse.json(
        {
          error:
            used
              ? "Este enlace ya fue utilizado."
              : message,
        },
        {
          status:
            used
              ? 410
              : 400,
        },
      );
    }

    /* =====================================================
       7. ÉXITO
    ===================================================== */

    return NextResponse.json(
      {
        success:
          true,

        testimonialId:
          data[0]
            .testimonial_id,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "Unexpected testimonial submit error:",
      error,
    );

    /*
      Limpieza de seguridad si algo
      explotó después del upload.
    */

    if (
      uploadedPhotoPath
    ) {
      await supabase
        .storage
        .from(
          "testimonial-photos",
        )
        .remove([
          uploadedPhotoPath,
        ]);
    }

    return NextResponse.json(
      {
        error:
          "No fue posible enviar tu testimonio.",
      },
      {
        status: 500,
      },
    );
  }
}
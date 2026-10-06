import { randomUUID } from "crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  authorizeAdminRequest,
} from "@/lib/admin/authorize-admin";

import {
  ALLOWED_COVER_MIME_TYPES,
  ALLOWED_RESOURCE_MIME_TYPES,
  MAX_COVER_SIZE,
  MAX_RESOURCE_SIZE,
  RESOURCE_BUCKET,
  sanitizeFilename,
} from "@/lib/resources/config";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

export const runtime = "nodejs";

type UploadBody = {
  kind?: unknown;
  filename?: unknown;
  mimeType?: unknown;
  size?: unknown;
};

export async function POST(
  request: NextRequest,
) {
  const authorization =
    await authorizeAdminRequest();

  if (!authorization.ok) {
    return NextResponse.json(
      {
        error:
          authorization.error,
      },
      {
        status:
          authorization.status,
      },
    );
  }

  let body: UploadBody;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Solicitud no válida.",
      },
      {
        status: 400,
      },
    );
  }

  const kind =
    body.kind;

  const filename =
    typeof body.filename === "string"
      ? body.filename.trim()
      : "";

  const mimeType =
    typeof body.mimeType === "string"
      ? body.mimeType.trim()
      : "";

  const size =
    Number(body.size);

  if (
    kind !== "resource" &&
    kind !== "cover"
  ) {
    return NextResponse.json(
      {
        error:
          "Tipo de archivo no válido.",
      },
      {
        status: 400,
      },
    );
  }

  if (!filename) {
    return NextResponse.json(
      {
        error:
          "El archivo necesita nombre.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !Number.isFinite(size) ||
    size <= 0
  ) {
    return NextResponse.json(
      {
        error:
          "El tamaño del archivo no es válido.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    kind === "resource"
  ) {
    if (
      size >
      MAX_RESOURCE_SIZE
    ) {
      return NextResponse.json(
        {
          error:
            "El archivo supera 20 MB.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !ALLOWED_RESOURCE_MIME_TYPES.has(
        mimeType,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Formato de archivo no permitido.",
        },
        {
          status: 400,
        },
      );
    }
  }

  if (
    kind === "cover"
  ) {
    if (
      size >
      MAX_COVER_SIZE
    ) {
      return NextResponse.json(
        {
          error:
            "La portada supera 5 MB.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !ALLOWED_COVER_MIME_TYPES.has(
        mimeType,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "La portada debe ser JPG, PNG o WebP.",
        },
        {
          status: 400,
        },
      );
    }
  }

  const filenameClean =
    sanitizeFilename(
      filename,
    );

  const path =
    `admin/${authorization.userId}/${kind}/${randomUUID()}-${filenameClean}`;

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase.storage
    .from(
      RESOURCE_BUCKET,
    )
    .createSignedUploadUrl(
      path,
      {
        upsert: false,
      },
    );

  if (
    error ||
    !data?.token
  ) {
    console.error(
      "Signed upload error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible preparar la subida.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    path,
    token:
      data.token,
  });
}
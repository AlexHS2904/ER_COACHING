import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  revalidatePath,
} from "next/cache";

import {
  authorizeAdminRequest,
} from "@/lib/admin/authorize-admin";

import {
  belongsToAdminUpload,
  isValidHttpUrl,
  RESOURCE_BUCKET,
} from "@/lib/resources/config";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

type CreateResourceBody = {
  title?: unknown;
  description?: unknown;
  category?: unknown;

  resourceType?: unknown;
  externalUrl?: unknown;

  storagePath?: unknown;
  originalFilename?: unknown;
  mimeType?: unknown;
  fileSize?: unknown;

  coverStoragePath?: unknown;
  coverOriginalFilename?: unknown;
  coverMimeType?: unknown;

  visibility?: unknown;
  active?: unknown;
  displayOrder?: unknown;
};

function refreshPaths() {
  revalidatePath(
    "/recursos",
  );

  revalidatePath(
    "/admin/recursos",
  );
}

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

  let body:
    CreateResourceBody;

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

  const title =
    typeof body.title === "string"
      ? body.title.trim()
      : "";

  const description =
    typeof body.description === "string"
      ? body.description.trim()
      : "";

  const category =
    typeof body.category === "string"
      ? body.category.trim()
      : "";

  const resourceType =
    body.resourceType;

  const externalUrl =
    typeof body.externalUrl === "string"
      ? body.externalUrl.trim()
      : "";

  const visibility =
    body.visibility;

  const active =
    body.active === undefined
      ? true
      : body.active;

  if (
    title.length < 2 ||
    title.length > 150
  ) {
    return NextResponse.json(
      {
        error:
          "El título debe tener entre 2 y 150 caracteres.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    category.length < 2 ||
    category.length > 80
  ) {
    return NextResponse.json(
      {
        error:
          "La categoría no es válida.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    resourceType !== "file" &&
    resourceType !== "link"
  ) {
    return NextResponse.json(
      {
        error:
          "Tipo de recurso no válido.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    visibility !== "public" &&
    visibility !== "private"
  ) {
    return NextResponse.json(
      {
        error:
          "Visibilidad no válida.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    typeof active !== "boolean"
  ) {
    return NextResponse.json(
      {
        error:
          "Estado no válido.",
      },
      {
        status: 400,
      },
    );
  }

  const storagePath =
    typeof body.storagePath === "string"
      ? body.storagePath
      : null;

  const coverStoragePath =
    typeof body.coverStoragePath === "string"
      ? body.coverStoragePath
      : null;

  if (
    storagePath &&
    !belongsToAdminUpload(
      storagePath,
      authorization.userId,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Ruta de archivo no válida.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    coverStoragePath &&
    !belongsToAdminUpload(
      coverStoragePath,
      authorization.userId,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Ruta de portada no válida.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    resourceType === "file" &&
    !storagePath
  ) {
    return NextResponse.json(
      {
        error:
          "Sube el archivo del recurso.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    resourceType === "link" &&
    !isValidHttpUrl(
      externalUrl,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Ingresa un enlace válido.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    getSupabaseAdmin();

  let displayOrder =
    Number(
      body.displayOrder,
    );

  if (
    body.displayOrder ===
      undefined ||
    body.displayOrder ===
      null ||
    body.displayOrder === ""
  ) {
    const {
      data: last,
    } = await supabase
      .from("resources")
      .select(
        "display_order",
      )
      .order(
        "display_order",
        {
          ascending: false,
        },
      )
      .limit(1)
      .maybeSingle();

    displayOrder =
      (
        last?.display_order ??
        0
      ) + 1;
  }

  if (
    !Number.isInteger(
      displayOrder,
    ) ||
    displayOrder < 0
  ) {
    return NextResponse.json(
      {
        error:
          "El orden no es válido.",
      },
      {
        status: 400,
      },
    );
  }

  const {
    data: resource,
    error,
  } = await supabase
    .from("resources")
    .insert({
      title,

      description:
        description ||
        null,

      category,

      resource_type:
        resourceType,

      external_url:
        resourceType === "link"
          ? externalUrl
          : null,

      storage_path:
        resourceType === "file"
          ? storagePath
          : null,

      original_filename:
        resourceType === "file" &&
        typeof body.originalFilename ===
          "string"
          ? body.originalFilename
          : null,

      mime_type:
        resourceType === "file" &&
        typeof body.mimeType ===
          "string"
          ? body.mimeType
          : null,

      file_size:
        resourceType === "file" &&
        body.fileSize !==
          undefined &&
        body.fileSize !== null
          ? Number(
              body.fileSize,
            )
          : null,

      cover_storage_path:
        coverStoragePath,

      cover_original_filename:
        typeof body.coverOriginalFilename ===
          "string"
          ? body.coverOriginalFilename
          : null,

      cover_mime_type:
        typeof body.coverMimeType ===
          "string"
          ? body.coverMimeType
          : null,

      visibility,

      active,

      display_order:
        displayOrder,

      updated_at:
        new Date().toISOString(),
    })
    .select("*")
    .single();

  if (
    error ||
    !resource
  ) {
    const paths = [
      storagePath,
      coverStoragePath,
    ].filter(
      (
        value,
      ): value is string =>
        Boolean(value),
    );

    if (
      paths.length > 0
    ) {
      await supabase.storage
        .from(
          RESOURCE_BUCKET,
        )
        .remove(paths);
    }

    console.error(
      "Create resource error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible crear el recurso.",
      },
      {
        status: 500,
      },
    );
  }

  refreshPaths();

  return NextResponse.json(
    {
      ok: true,
      resource,
    },
    {
      status: 201,
    },
  );
}
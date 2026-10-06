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

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function refreshPaths() {
  revalidatePath(
    "/recursos",
  );

  revalidatePath(
    "/admin/recursos",
  );
}

/* =========================================================
   PUT
========================================================= */

export async function PUT(
  request: NextRequest,
  context: RouteContext,
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

  const { id } =
    await context.params;

  const supabase =
    getSupabaseAdmin();

  const {
    data: current,
    error: currentError,
  } = await supabase
    .from("resources")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (
    currentError ||
    !current
  ) {
    return NextResponse.json(
      {
        error:
          "El recurso no existe.",
      },
      {
        status: 404,
      },
    );
  }

  const body =
    await request.json();

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

  const visibility =
    body.visibility;

  const active =
    body.active;

  const externalUrl =
    typeof body.externalUrl === "string"
      ? body.externalUrl.trim()
      : "";

  const displayOrder =
    Number(
      body.displayOrder,
    );

  if (
    title.length < 2 ||
    title.length > 150 ||
    category.length < 2 ||
    category.length > 80
  ) {
    return NextResponse.json(
      {
        error:
          "Revisa el título y la categoría.",
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

  if (
    !Number.isInteger(
      displayOrder,
    ) ||
    displayOrder < 0
  ) {
    return NextResponse.json(
      {
        error:
          "Orden no válido.",
      },
      {
        status: 400,
      },
    );
  }

  const uploadedPath =
    typeof body.storagePath === "string"
      ? body.storagePath
      : null;

  const uploadedCover =
    typeof body.coverStoragePath ===
    "string"
      ? body.coverStoragePath
      : null;

  if (
    uploadedPath &&
    !belongsToAdminUpload(
      uploadedPath,
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
    uploadedCover &&
    !belongsToAdminUpload(
      uploadedCover,
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

  let finalStoragePath:
    string | null =
    null;

  let finalOriginalFilename:
    string | null =
    null;

  let finalMimeType:
    string | null =
    null;

  let finalFileSize:
    number | null =
    null;

  if (
    resourceType === "file"
  ) {
    if (uploadedPath) {
      finalStoragePath =
        uploadedPath;

      finalOriginalFilename =
        typeof body.originalFilename ===
          "string"
          ? body.originalFilename
          : null;

      finalMimeType =
        typeof body.mimeType ===
          "string"
          ? body.mimeType
          : null;

      finalFileSize =
        body.fileSize !==
          null &&
        body.fileSize !==
          undefined
          ? Number(
              body.fileSize,
            )
          : null;
    } else if (
      current.resource_type ===
        "file"
    ) {
      finalStoragePath =
        current.storage_path;

      finalOriginalFilename =
        current.original_filename;

      finalMimeType =
        current.mime_type;

      finalFileSize =
        current.file_size;
    } else {
      return NextResponse.json(
        {
          error:
            "Sube un archivo para este recurso.",
        },
        {
          status: 400,
        },
      );
    }
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

  let finalCoverPath =
    current.cover_storage_path;

  let finalCoverName =
    current.cover_original_filename;

  let finalCoverMime =
    current.cover_mime_type;

  if (
    body.removeCover === true
  ) {
    finalCoverPath =
      null;

    finalCoverName =
      null;

    finalCoverMime =
      null;
  } else if (
    uploadedCover
  ) {
    finalCoverPath =
      uploadedCover;

    finalCoverName =
      typeof body.coverOriginalFilename ===
        "string"
        ? body.coverOriginalFilename
        : null;

    finalCoverMime =
      typeof body.coverMimeType ===
        "string"
        ? body.coverMimeType
        : null;
  }

  const {
    data: updated,
    error: updateError,
  } = await supabase
    .from("resources")
    .update({
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
        finalStoragePath,

      original_filename:
        finalOriginalFilename,

      mime_type:
        finalMimeType,

      file_size:
        finalFileSize,

      cover_storage_path:
        finalCoverPath,

      cover_original_filename:
        finalCoverName,

      cover_mime_type:
        finalCoverMime,

      visibility,

      active,

      display_order:
        displayOrder,

      updated_at:
        new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (
    updateError ||
    !updated
  ) {
    return NextResponse.json(
      {
        error:
          "No fue posible actualizar el recurso.",
      },
      {
        status: 500,
      },
    );
  }

  const obsoletePaths:
    string[] = [];

  if (
    current.storage_path &&
    current.storage_path !==
      finalStoragePath
  ) {
    obsoletePaths.push(
      current.storage_path,
    );
  }

  if (
    current.cover_storage_path &&
    current.cover_storage_path !==
      finalCoverPath
  ) {
    obsoletePaths.push(
      current.cover_storage_path,
    );
  }

  if (
    obsoletePaths.length > 0
  ) {
    await supabase.storage
      .from(
        RESOURCE_BUCKET,
      )
      .remove(
        obsoletePaths,
      );
  }

  refreshPaths();

  return NextResponse.json({
    ok: true,
    resource:
      updated,
  });
}

/* =========================================================
   PATCH
========================================================= */

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
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

  const { id } =
    await context.params;

  const body =
    await request.json();

  if (
    typeof body.active !==
    "boolean"
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

  const supabase =
    getSupabaseAdmin();

  const {
    data: resource,
    error,
  } = await supabase
    .from("resources")
    .update({
      active:
        body.active,

      updated_at:
        new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (
    error ||
    !resource
  ) {
    return NextResponse.json(
      {
        error:
          "No fue posible actualizar el recurso.",
      },
      {
        status: 500,
      },
    );
  }

  refreshPaths();

  return NextResponse.json({
    ok: true,
    resource,
  });
}

/* =========================================================
   DELETE
========================================================= */

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
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

  const { id } =
    await context.params;

  const supabase =
    getSupabaseAdmin();

  const {
    data: resource,
    error: findError,
  } = await supabase
    .from("resources")
    .select(`
      id,
      storage_path,
      cover_storage_path
    `)
    .eq("id", id)
    .maybeSingle();

  if (
    findError ||
    !resource
  ) {
    return NextResponse.json(
      {
        error:
          "El recurso no existe.",
      },
      {
        status: 404,
      },
    );
  }

  const {
    error: deleteError,
  } = await supabase
    .from("resources")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      {
        error:
          "No fue posible eliminar el recurso.",
      },
      {
        status: 500,
      },
    );
  }

  const paths = [
    resource.storage_path,
    resource.cover_storage_path,
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

  refreshPaths();

  return NextResponse.json({
    ok: true,
  });
}
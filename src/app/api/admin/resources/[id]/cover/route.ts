import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  authorizeAdminRequest,
} from "@/lib/admin/authorize-admin";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
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
    error,
  } = await supabase
    .from("resources")
    .select(`
      cover_storage_path,
      cover_mime_type
    `)
    .eq("id", id)
    .maybeSingle();

  if (
    error ||
    !resource?.cover_storage_path
  ) {
    return new NextResponse(
      null,
      {
        status: 404,
      },
    );
  }

  const {
    data: file,
    error: storageError,
  } = await supabase.storage
    .from("resources")
    .download(
      resource.cover_storage_path,
    );

  if (
    storageError ||
    !file
  ) {
    console.error(
      "Admin cover error:",
      storageError,
    );

    return new NextResponse(
      null,
      {
        status: 404,
      },
    );
  }

  const bytes =
    new Uint8Array(
      await file.arrayBuffer(),
    );

  return new NextResponse(
    bytes,
    {
      headers: {
        "Content-Type":
          resource.cover_mime_type ||
          file.type ||
          "image/jpeg",

        "Cache-Control":
          "private, max-age=300",
      },
    },
  );
}
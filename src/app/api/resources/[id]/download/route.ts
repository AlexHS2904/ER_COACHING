import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
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
      resource_type,
      storage_path,
      original_filename,
      visibility,
      active
    `)
    .eq("id", id)
    .maybeSingle();

  if (
    error ||
    !resource ||
    !resource.active ||
    resource.visibility !==
      "public" ||
    resource.resource_type !==
      "file" ||
    !resource.storage_path
  ) {
    return NextResponse.json(
      {
        error:
          "Recurso no disponible.",
      },
      {
        status: 404,
      },
    );
  }

  const {
    data,
    error: signedError,
  } = await supabase.storage
    .from("resources")
    .createSignedUrl(
      resource.storage_path,
      60,
      {
        download:
          resource.original_filename ||
          true,
      },
    );

  if (
    signedError ||
    !data?.signedUrl
  ) {
    return NextResponse.json(
      {
        error:
          "No fue posible descargar el recurso.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.redirect(
    data.signedUrl,
  );
}
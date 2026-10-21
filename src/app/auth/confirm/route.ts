
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const redirectTo = new URL(
    "/admin/establecer-contrasena",
    request.url
  );

  if (!tokenHash || type !== "invite") {
    return NextResponse.redirect(
      new URL("/admin/login?error=invalid_invite", request.url)
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "invite",
  });

  if (error) {
    return NextResponse.redirect(
      new URL("/admin/login?error=expired_invite", request.url)
    );
  }

  return NextResponse.redirect(redirectTo);
}

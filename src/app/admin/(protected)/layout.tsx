import { redirect } from "next/navigation";

import AdminSidebar from "@/components/admin/AdminSidebar";

import { createClient } from "@/lib/supabase/server";

type AdminLayoutProps = {
  children: React.ReactNode;
};

export default async function AdminLayout({
  children,
}: AdminLayoutProps) {
  const supabase =
    await createClient();

  const {
    data: claimsData,
  } =
    await supabase.auth.getClaims();

  const userId =
    claimsData?.claims?.sub;

  if (!userId) {
    redirect("/admin/login");
  }

  const {
    data: admin,
    error,
  } = await supabase
    .from("admin_users")
    .select(`
      user_id,
      role,
      active
    `)
    .eq(
      "user_id",
      userId,
    )
    .maybeSingle();

  if (
    error ||
    !admin ||
    !admin.active
  ) {
    await supabase.auth.signOut();

    redirect("/admin/login");
  }

  return (
    <div className="min-h-screen bg-brand-cream">
      <AdminSidebar />

      <div className="lg:pl-[260px]">
        {children}
      </div>
    </div>
  );
}
import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

import AdminFormsClient from "@/components/admin/AdminFormsClient";
import { requireAdmin } from "@/lib/admin/require-admin";

export const dynamic =
  "force-dynamic";

export default async function AdminFormsPage() {
  await requireAdmin();

  const supabase =
    getSupabaseAdmin();

  const {
    data,
  } = await supabase
    .from(
      "booking_intake_forms",
    )
    .select(
      `
        id,
        booking_id,
        source_type,
        invitee_name,
        invitee_email,
        status,
        current_step,
        submitted_at,
        expires_at,
        created_at
      `,
    )
    .order(
      "created_at",
      {
        ascending:
          false,
      },
    );

  return (
    <AdminFormsClient
      initialForms={
        data ??
        []
      }
    />
  );
}

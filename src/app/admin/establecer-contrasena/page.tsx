
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SetPasswordForm from "./SetPasswordForm";

export default async function SetPasswordPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/admin/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-cream px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-brand-taupe/25 bg-white p-8">
        <h1 className="text-2xl font-semibold text-brand-brown">
          Bienvenida a Edna Rojo Coaching
        </h1>

        <p className="mt-3 text-sm text-brand-brown/70">
          Establece tu contraseña para acceder al
          panel de administración.
        </p>

        <SetPasswordForm />
      </section>
    </main>
  );
}

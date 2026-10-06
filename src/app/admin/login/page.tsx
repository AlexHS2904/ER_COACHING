import {
  redirect,
} from "next/navigation";

import {
  createClient,
} from "@/lib/supabase/server";

import LoginForm from "./LoginForm";

export default async function AdminLoginPage() {
  const supabase =
    await createClient();

  const {
    data: claimsData,
  } =
    await supabase.auth.getClaims();

  if (claimsData?.claims?.sub) {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-cream px-5">
      <div className="w-full max-w-[430px]">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-wine">
            ER Coaching
          </p>

          <h1 className="mt-4 font-display text-5xl font-semibold text-brand-brown">
            Administración
          </h1>

          <p className="mt-4 text-sm leading-6 text-brand-brown/55">
            Inicia sesión para gestionar
            tus reservas y agenda.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
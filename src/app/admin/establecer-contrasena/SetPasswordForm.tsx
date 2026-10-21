
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordForm() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");

    if (password.length < 12) {
      setError("Utiliza al menos 12 caracteres.");
      return;
    }

    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    const supabase = createClient();

    const { error: updateError } =
      await supabase.auth.updateUser({
        password,
      });

    if (updateError) {
      setError(
        "No fue posible establecer la contraseña. " +
        updateError.message
      );
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();

    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div>
        <label
          htmlFor="password"
          className="text-sm font-medium text-brand-brown"
        >
          Nueva contraseña
        </label>

        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-xl border border-brand-taupe/30 bg-brand-cream/50 px-4 py-3 outline-none focus:border-brand-wine"
        />
      </div>

      <div>
        <label
          htmlFor="confirmation"
          className="text-sm font-medium text-brand-brown"
        >
          Confirmar contraseña
        </label>

        <input
          id="confirmation"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          className="mt-2 w-full rounded-xl border border-brand-taupe/30 bg-brand-cream/50 px-4 py-3 outline-none focus:border-brand-wine"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-brand-wine">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-brand-wine px-6 py-4 font-semibold text-brand-cream disabled:opacity-50"
      >
        {loading ? "Guardando..." : "Establecer contraseña"}
      </button>
    </form>
  );
}

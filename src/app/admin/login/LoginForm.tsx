"use client";

import {
  type FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  createClient,
} from "@/lib/supabase/client";

export default function LoginForm() {
  const router =
    useRouter();

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const supabase =
      createClient();

    const {
      error: loginError,
    } =
      await supabase.auth
        .signInWithPassword({
          email:
            email.trim().toLowerCase(),

          password,
        });

    if (loginError) {
      setError(
        "El correo o la contraseña no son correctos.",
      );

      setLoading(false);

      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="
        rounded-[1.75rem]
        border
        border-brand-taupe/25
        bg-white/60
        p-7
        sm:p-8
      "
    >
      <div>
        <label
          htmlFor="admin-email"
          className="text-sm font-semibold text-brand-brown"
        >
          Correo electrónico
        </label>

        <input
          id="admin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) =>
            setEmail(
              event.target.value,
            )
          }
          className="
            mt-2
            w-full
            rounded-xl
            border
            border-brand-taupe/30
            bg-brand-cream/50
            px-4
            py-3.5
            text-brand-brown
            outline-none
            transition-colors
            focus:border-brand-wine
          "
        />
      </div>

      <div className="mt-5">
        <label
          htmlFor="admin-password"
          className="text-sm font-semibold text-brand-brown"
        >
          Contraseña
        </label>

        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) =>
            setPassword(
              event.target.value,
            )
          }
          className="
            mt-2
            w-full
            rounded-xl
            border
            border-brand-taupe/30
            bg-brand-cream/50
            px-4
            py-3.5
            text-brand-brown
            outline-none
            transition-colors
            focus:border-brand-wine
          "
        />
      </div>

      {error && (
        <div
          role="alert"
          className="
            mt-5
            rounded-xl
            border
            border-brand-wine/20
            bg-brand-wine/5
            px-4
            py-3
            text-sm
            text-brand-wine
          "
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="
          mt-7
          flex
          min-h-[54px]
          w-full
          items-center
          justify-center
          rounded-xl
          bg-brand-wine
          px-6
          font-semibold
          text-brand-cream
          transition-colors
          hover:bg-brand-brown
          disabled:cursor-not-allowed
          disabled:opacity-50
        "
      >
        {loading
          ? "Entrando..."
          : "Iniciar sesión"}
      </button>
    </form>
  );
}
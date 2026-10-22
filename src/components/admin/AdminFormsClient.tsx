"use client";

import {
  useRouter,
} from "next/navigation";

import {
  useState,
} from "react";

type Intake = {
  id: string;
  booking_id:
    | string
    | null;
  source_type:
    string;
  invitee_name:
    string;
  invitee_email:
    string;
  status:
    string;
  current_step:
    number;
  submitted_at:
    | string
    | null;
  expires_at:
    | string
    | null;
  created_at:
    string;
};

export default function AdminFormsClient({
  initialForms,
}: {
  initialForms:
    Intake[];
}) {
  const router =
    useRouter();

  const [
    name,
    setName,
  ] =
    useState("");

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    createdUrl,
    setCreatedUrl,
  ] =
    useState<
      string | null
    >(null);

  async function createInvitation() {
    setLoading(
      true,
    );

    setError("");

    setCreatedUrl(
      null,
    );

    try {
      const response =
        await fetch(
          "/api/admin/intake-invitations",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                name,
                email,
              }),
          },
        );

      const data =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ??
            "No fue posible crear la invitación.",
        );
      }

      setCreatedUrl(
        data.formUrl,
      );

      setName("");
      setEmail("");

      router.refresh();
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : "No fue posible crear la invitación.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  async function copyLink(
    id: string,
  ) {
    const response =
      await fetch(
        `/api/admin/intake-invitations/${id}/link`,
        {
          cache:
            "no-store",
        },
      );

    const data =
      await response.json();

    if (
      response.ok &&
      data.formUrl
    ) {
      await navigator
        .clipboard
        .writeText(
          data.formUrl,
        );
    }
  }

  return (
    <main
      className="
        px-6
        py-10
        lg:px-12
      "
    >
      <div
        className="
          mx-auto
          max-w-[1100px]
        "
      >
        <p
          className="
            text-xs
            font-semibold
            uppercase
            tracking-[0.22em]
            text-brand-wine
          "
        >
          Administración
        </p>

        <h1
          className="
            mt-3
            font-display
            text-5xl
            font-semibold
            text-brand-brown
          "
        >
          Formularios
        </h1>

        <div
          className="
            mt-10
            rounded-[2rem]
            border
            border-brand-taupe/25
            bg-white/70
            p-7
          "
        >
          <h2
            className="
              font-display
              text-3xl
              text-brand-brown
            "
          >
            Nueva invitación
          </h2>

          <p
  className="
    mt-2
    text-sm
    text-brand-brown/50
  "
>
  Se enviará un enlace personal para completar el formulario.
</p>

          <div
            className="
              mt-6
              grid
              gap-4
              md:grid-cols-2
            "
          >
            <input
              value={
                name
              }
              onChange={(
                event,
              ) =>
                setName(
                  event.target
                    .value,
                )
              }
              placeholder="Nombre"
              className="
                rounded-xl
                border
                border-brand-taupe/30
                px-4
                py-3.5
              "
            />

            <input
              type="email"
              value={
                email
              }
              onChange={(
                event,
              ) =>
                setEmail(
                  event.target
                    .value,
                )
              }
              placeholder="Correo electrónico"
              className="
                rounded-xl
                border
                border-brand-taupe/30
                px-4
                py-3.5
              "
            />
          </div>

          <button
            type="button"
            disabled={
              loading
            }
            onClick={
              createInvitation
            }
            className="
              mt-5
              rounded-xl
              bg-brand-wine
              px-6
              py-3.5
              font-semibold
              text-white
              disabled:opacity-50
            "
          >
            {loading
              ? "Creando..."
              : "Enviar invitación"}
          </button>

          {createdUrl && (
            <button
              type="button"
              onClick={() =>
                navigator
                  .clipboard
                  .writeText(
                    createdUrl,
                  )
              }
              className="
                ml-3
                mt-5
                rounded-xl
                border
                border-brand-wine/25
                px-6
                py-3.5
                font-semibold
                text-brand-wine
              "
            >
              Copiar enlace
            </button>
          )}

          {error && (
            <p className="mt-4 text-sm text-brand-wine">
              {error}
            </p>
          )}
        </div>

        <div
          className="
            mt-10
            space-y-3
          "
        >
          {initialForms.map(
            (
              form,
            ) => (
              <div
                key={
                  form.id
                }
                className="
                  flex
                  flex-col
                  gap-5
                  rounded-2xl
                  border
                  border-brand-taupe/20
                  bg-white/70
                  p-6
                  md:flex-row
                  md:items-center
                  md:justify-between
                "
              >
                <div>
                  <p
                    className="
                      font-display
                      text-2xl
                      text-brand-brown
                    "
                  >
                    {
                      form.invitee_name
                    }
                  </p>

                  <p
                    className="
                      mt-1
                      text-sm
                      text-brand-brown/50
                    "
                  >
                    {
                      form.invitee_email
                    }
                  </p>

                  <p
                    className="
                      mt-3
                      text-xs
                      font-semibold
                      uppercase
                      tracking-[0.14em]
                      text-brand-wine
                    "
                  >
                    {form.source_type ===
                    "manual"
                      ? "Invitación manual"
                      : "Reserva 1:1"}
                    {" · "}
                    {form.submitted_at
                      ? "Completado"
                      : `Sección ${form.current_step}/5`}
                  </p>
                </div>

                {!form.submitted_at && (
                  <button
                    type="button"
                    onClick={() =>
                      copyLink(
                        form.id,
                      )
                    }
                    className="
                      rounded-xl
                      border
                      border-brand-taupe/30
                      px-5
                      py-3
                      text-sm
                      font-semibold
                      text-brand-brown
                    "
                  >
                    Copiar enlace
                  </button>
                )}
              </div>
            ),
          )}
        </div>
      </div>
    </main>
  );
}
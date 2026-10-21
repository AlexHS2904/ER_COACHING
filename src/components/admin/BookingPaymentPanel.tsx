"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type Props = {
  bookingId: string;

  serviceName:
    | string
    | null;

  initialPaymentStatus:
    string;
};

export default function BookingPaymentPanel({
  bookingId,
  serviceName,
  initialPaymentStatus,
}: Props) {
  const router =
    useRouter();

  const [
    paymentStatus,
    setPaymentStatus,
  ] =
    useState(
      initialPaymentStatus,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    linkLoading,
    setLinkLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    formUrl,
    setFormUrl,
  ] =
    useState<
      string | null
    >(null);

  const [
    emailSent,
    setEmailSent,
  ] =
    useState<
      boolean | null
    >(null);

  const [
    submitted,
    setSubmitted,
  ] =
    useState(false);

  const [
    copied,
    setCopied,
  ] =
    useState(false);

  /*
    MUY IMPORTANTE:
    si Next refresca los datos del booking,
    sincronizamos el state local.
  */

  useEffect(() => {
    setPaymentStatus(
      initialPaymentStatus,
    );
  }, [
    initialPaymentStatus,
  ]);

  /*
    Si la reserva YA estaba pagada al abrir
    el drawer, recuperamos automáticamente
    el enlace desde el servidor.
  */

  useEffect(() => {
    if (
      initialPaymentStatus !==
      "paid"
    ) {
      return;
    }

    let cancelled =
      false;

    async function loadLink() {
      setLinkLoading(
        true,
      );

      try {
        const response =
          await fetch(
            `/api/admin/intake/by-booking/${bookingId}/link`,
            {
              method:
                "GET",

              cache:
                "no-store",
            },
          );

        const contentType =
            response.headers.get(
                "content-type",
            );

            let data: {
            error?: string;
            formUrl?: string;
            submitted?: boolean;
            } = {};

            if (
            contentType?.includes(
                "application/json",
            )
            ) {
            data =
                await response.json();
            }

            if (!response.ok) {
            throw new Error(
                data.error ??
                `No fue posible recuperar el formulario (${response.status}).`,
            );
            }
        if (
          !response.ok
        ) {
          throw new Error(
            data.error ??
              "No fue posible recuperar el formulario.",
          );
        }

        if (!cancelled) {
          setFormUrl(
            data.formUrl ??
              null,
          );

          setSubmitted(
            Boolean(
              data.submitted,
            ),
          );
        }
      } catch (
        requestError
      ) {
        if (!cancelled) {
          setError(
            requestError instanceof
              Error
              ? requestError.message
              : "No fue posible recuperar el formulario.",
          );
        }
      } finally {
        if (!cancelled) {
          setLinkLoading(
            false,
          );
        }
      }
    }

    void loadLink();

    return () => {
      cancelled =
        true;
    };
  }, [
    bookingId,
    initialPaymentStatus,
  ]);

  if (
    serviceName !==
    "Sesión 1:1"
  ) {
    return null;
  }

  async function markPaid() {
    setLoading(
      true,
    );

    setError("");

    try {
      const response =
        await fetch(
          "/api/admin/payments/mark-paid",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                bookingId,
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
            "No fue posible registrar el pago.",
        );
      }

      setPaymentStatus(
        "paid",
      );

      setFormUrl(
        data.formUrl ??
          null,
      );

      setEmailSent(
        Boolean(
          data.emailSent,
        ),
      );

      /*
        Hace que /admin/reservas vuelva
        a consultar Supabase.

        Esto soluciona el "Pendiente"
        que reaparecía al cerrar el drawer.
      */

      router.refresh();
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : "No fue posible registrar el pago.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  async function copyLink() {
    if (!formUrl) {
      return;
    }

    await navigator
      .clipboard
      .writeText(
        formUrl,
      );

    setCopied(
      true,
    );

    window.setTimeout(
      () => {
        setCopied(
          false,
        );
      },
      1800,
    );
  }

  return (
    <section
      className="
        mt-6
        rounded-2xl
        border
        border-brand-taupe/25
        bg-white/70
        p-5
      "
    >
      <div
        className="
          flex
          items-start
          justify-between
          gap-5
        "
      >
        <div>
          <p
            className="
              text-xs
              font-semibold
              uppercase
              tracking-[0.18em]
              text-brand-wine
            "
          >
            Pago y formulario
          </p>

          <p
            className="
              mt-2
              text-sm
              text-brand-brown/55
            "
          >
            Sesión individual
          </p>
        </div>

        <span
          className={`
            rounded-full
            px-3
            py-1.5
            text-xs
            font-semibold

            ${
              paymentStatus ===
              "paid"
                ? "bg-brand-green/10 text-brand-green"
                : "bg-brand-wine/10 text-brand-wine"
            }
          `}
        >
          {paymentStatus ===
          "paid"
            ? "Pagado"
            : "Pendiente"}
        </span>
      </div>

      {paymentStatus !==
        "paid" && (
        <button
          type="button"
          disabled={
            loading
          }
          onClick={
            markPaid
          }
          className="
            mt-5
            w-full
            rounded-xl
            bg-brand-wine
            px-5
            py-3.5
            text-sm
            font-semibold
            text-white
            disabled:opacity-50
          "
        >
          {loading
            ? "Registrando..."
            : "Marcar como pagado"}
        </button>
      )}

      {paymentStatus ===
        "paid" && (
        <div
          className="
            mt-5
            space-y-3
          "
        >
          <div
            className="
              rounded-xl
              bg-brand-green/[0.07]
              px-4
              py-3
            "
          >
            <p
              className="
                text-xs
                font-semibold
                uppercase
                tracking-[0.14em]
                text-brand-green
              "
            >
              Formulario
            </p>

            <p
              className="
                mt-1
                text-sm
                text-brand-brown/60
              "
            >
              {submitted
                ? "Completado por el cliente"
                : "Disponible para el cliente"}
            </p>
          </div>

          <Link
            href={`/admin/reservas/${bookingId}/formulario`}
            className="
              block
              rounded-xl
              border
              border-brand-green/25
              px-4
              py-3
              text-center
              text-sm
              font-semibold
              text-brand-green
            "
          >
            Ver formulario
          </Link>

          {linkLoading ? (
            <div
              className="
                rounded-xl
                border
                border-brand-taupe/25
                px-4
                py-3
                text-center
                text-sm
                text-brand-brown/45
              "
            >
              Recuperando
              enlace...
            </div>
          ) : formUrl ? (
            <button
              type="button"
              onClick={
                copyLink
              }
              className="
                w-full
                rounded-xl
                border
                border-brand-taupe/30
                px-4
                py-3
                text-sm
                font-semibold
                text-brand-brown
              "
            >
              {copied
                ? "Enlace copiado"
                : "Copiar enlace del formulario"}
            </button>
          ) : null}

          {emailSent !==
            null && (
            <p
              className="
                text-center
                text-xs
                leading-5
                text-brand-brown/45
              "
            >
              {emailSent
                ? "El enlace también fue enviado por correo."
                : "El pago quedó registrado, pero el correo no pudo enviarse. Puedes compartir el enlace manualmente."}
            </p>
          )}
        </div>
      )}

      {error && (
        <p
          className="
            mt-4
            text-sm
            leading-6
            text-brand-wine
          "
        >
          {error}
        </p>
      )}
    </section>
  );
}
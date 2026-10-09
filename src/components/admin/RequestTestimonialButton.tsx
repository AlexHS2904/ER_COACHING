"use client";

import {
  useState,
} from "react";

type Props = {
  sourceType:
    | "booking"
    | "process";

  sourceId: string;
};

export default function RequestTestimonialButton({
  sourceType,
  sourceId,
}: Props) {
  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    reviewUrl,
    setReviewUrl,
  ] =
    useState("");

  const [
    copied,
    setCopied,
  ] =
    useState(false);

  const [
    emailSent,
    setEmailSent,
  ] =
    useState<
      boolean | null
    >(null);

  const [
    error,
    setError,
  ] =
    useState("");

  async function generate() {
    setLoading(
      true,
    );

    setError("");
    setCopied(
      false,
    );
    setReviewUrl(
      "",
    );

    try {
      const response =
        await fetch(
          "/api/admin/review-invitations",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                {
                  sourceType,
                  sourceId,
                },
              ),
          },
        );

      const result =
        (await response.json()) as {
          success?: boolean;

          reviewUrl?: string;

          emailSent?: boolean;

          error?: string;
        };

      if (
        !response.ok ||
        !result.success ||
        !result.reviewUrl
      ) {
        throw new Error(
          result.error ??
            "No fue posible generar el enlace.",
        );
      }

      setReviewUrl(
        result.reviewUrl,
      );

      setEmailSent(
        Boolean(
          result.emailSent,
        ),
      );
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : "Ocurrió un error.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  async function copy() {
    if (!reviewUrl) {
      return;
    }

    await navigator
      .clipboard
      .writeText(
        reviewUrl,
      );

    setCopied(
      true,
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={
          loading
        }
        onClick={
          generate
        }
        className="
          rounded-xl
          bg-brand-wine
          px-5
          py-3
          text-sm
          font-semibold
          text-white
          transition
          hover:opacity-90
          disabled:opacity-50
        "
      >
        {loading
          ? "Generando..."
          : reviewUrl
            ? "Generar nuevo enlace"
            : "Solicitar testimonio"}
      </button>

      {reviewUrl && (
        <div
          className="
            mt-4
            rounded-xl
            border
            border-brand-taupe/25
            bg-white/60
            p-4
          "
        >
          <p
            className="
              break-all
              text-xs
              leading-5
              text-brand-brown/55
            "
          >
            {reviewUrl}
          </p>

          <button
            type="button"
            onClick={
              copy
            }
            className="
              mt-3
              text-sm
              font-semibold
              text-brand-wine
            "
          >
            {copied
              ? "✓ Copiado"
              : "Copiar enlace"}
          </button>

          <p
            className="
              mt-3
              text-xs
              text-brand-brown/45
            "
          >
            {emailSent
              ? "✓ También fue enviado por correo."
              : "No se pudo enviar el correo. Puedes compartir este enlace manualmente."}
          </p>
        </div>
      )}

      {error && (
        <p
          className="
            mt-3
            text-sm
            text-brand-wine
          "
        >
          {error}
        </p>
      )}
    </div>
  );
}
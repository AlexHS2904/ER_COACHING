"use client";

import {
  useState,
} from "react";

type Props = {
  processId: string;
  customerEmail: string;
  disabled?: boolean;
};

export default function RegenerateProcessAccessButton({
  processId,
  customerEmail,
  disabled = false,
}: Props) {
  const [
    confirming,
    setConfirming,
  ] =
    useState(false);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    success,
    setSuccess,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState("");

  async function handleRegenerate() {
    if (
      loading ||
      disabled
    ) {
      return;
    }

    setLoading(
      true,
    );

    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          `/api/admin/processes/${encodeURIComponent(
            processId,
          )}/regenerate-access`,
          {
            method:
              "POST",
          },
        );

      const result =
        (await response.json()) as {
          success?: boolean;
          message?: string;
          error?: string;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "No fue posible regenerar el acceso.",
        );
      }

      setSuccess(
        result.message ??
          "Nuevo acceso enviado.",
      );

      setConfirming(
        false,
      );
    } catch (requestError) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : "Ocurrió un error inesperado.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  if (
    disabled
  ) {
    return null;
  }

  return (
    <div>
      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            setConfirming(
              true,
            );

            setSuccess("");
            setError("");
          }}
          className="
            inline-flex
            items-center
            justify-center
            rounded-xl
            border
            border-brand-wine/20
            px-5
            py-3
            text-sm
            font-semibold
            text-brand-wine
            transition
            hover:bg-brand-wine/5
          "
        >
          Regenerar acceso
        </button>
      ) : (
        <div
          className="
            max-w-[520px]
            rounded-2xl
            border
            border-brand-wine/15
            bg-brand-wine/[0.04]
            p-5
          "
        >
          <p
            className="
              font-semibold
              text-brand-brown
            "
          >
            ¿Generar un nuevo enlace?
          </p>

          <p
            className="
              mt-2
              text-sm
              leading-6
              text-brand-brown/55
            "
          >
            Se enviará un nuevo
            acceso a{" "}

            <strong>
              {
                customerEmail
              }
            </strong>

            . El enlace privado
            anterior dejará de
            funcionar.
          </p>

          <div
            className="
              mt-4
              flex
              flex-wrap
              gap-3
            "
          >
            <button
              type="button"
              onClick={
                handleRegenerate
              }
              disabled={
                loading
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
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              {loading
                ? "Enviando..."
                : "Sí, regenerar"}
            </button>

            <button
              type="button"
              disabled={
                loading
              }
              onClick={() =>
                setConfirming(
                  false,
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
                text-brand-brown/60
              "
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {success && (
        <p
          className="
            mt-3
            text-sm
            font-semibold
            text-brand-green
          "
          role="status"
        >
          ✓ {success}
        </p>
      )}

      {error && (
        <p
          className="
            mt-3
            max-w-[520px]
            text-sm
            leading-6
            text-[#8A3535]
          "
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
"use client";

import {
  type FormEvent,
  useEffect,
  useState,
} from "react";

import ReviewAvatar from "@/components/reviews/ReviewAvatar";

import {
  REVIEW_AVATARS,
  type ReviewAvatarKey,
} from "@/lib/reviews/avatars";

type Props = {
  token: string;

  customerName: string;
  serviceName: string;
};

type IdentityMode =
  | "avatar"
  | "photo";

const MAX_PHOTO_BYTES =
  4 * 1024 * 1024;

export default function ReviewForm({
  token,
  customerName,
  serviceName,
}: Props) {
  const [
    authorName,
    setAuthorName,
  ] =
    useState(
      customerName,
    );

  const [
    rating,
    setRating,
  ] =
    useState(0);

  const [
    content,
    setContent,
  ] =
    useState("");

  const [
    identityMode,
    setIdentityMode,
  ] =
    useState<IdentityMode>(
      "avatar",
    );

  const [
    avatarKey,
    setAvatarKey,
  ] =
    useState<ReviewAvatarKey>(
      "claridad",
    );

  const [
    photo,
    setPhoto,
  ] =
    useState<File | null>(
      null,
    );

  const [
    previewUrl,
    setPreviewUrl,
  ] =
    useState<
      string | null
    >(null);

  const [
    consent,
    setConsent,
  ] =
    useState(false);

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState(false);

  useEffect(() => {
    if (!photo) {
      setPreviewUrl(
        null,
      );

      return;
    }

    const url =
      URL.createObjectURL(
        photo,
      );

    setPreviewUrl(
      url,
    );

    return () => {
      URL.revokeObjectURL(
        url,
      );
    };
  }, [photo]);

  function handlePhoto(
    file:
      | File
      | null,
  ) {
    setError("");

    if (!file) {
      setPhoto(
        null,
      );

      return;
    }

    if (
      file.size >
      MAX_PHOTO_BYTES
    ) {
      setError(
        "La fotografía debe pesar máximo 4 MB.",
      );

      return;
    }

    setPhoto(
      file,
    );
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");

    if (
      authorName
        .trim()
        .length <
      2
    ) {
      setError(
        "Escribe tu nombre.",
      );

      return;
    }

    if (
      rating <
      1
    ) {
      setError(
        "Selecciona una calificación.",
      );

      return;
    }

    if (
      content
        .trim()
        .length <
      10
    ) {
      setError(
        "Tu reseña debe tener al menos 10 caracteres.",
      );

      return;
    }

    if (
      identityMode ===
        "photo" &&
      !photo
    ) {
      setError(
        "Selecciona una fotografía o usa uno de nuestros avatares.",
      );

      return;
    }

    if (!consent) {
      setError(
        "Necesitamos tu autorización para poder publicar el testimonio.",
      );

      return;
    }

    const formData =
      new FormData();

    formData.set(
      "authorName",
      authorName.trim(),
    );

    formData.set(
      "rating",
      String(
        rating,
      ),
    );

    formData.set(
      "content",
      content.trim(),
    );

    formData.set(
      "consent",
      String(
        consent,
      ),
    );

    formData.set(
      "identityMode",
      identityMode,
    );

    if (
      identityMode ===
      "avatar"
    ) {
      formData.set(
        "avatarKey",
        avatarKey,
      );
    }

    if (
      identityMode ===
        "photo" &&
      photo
    ) {
      formData.set(
        "photo",
        photo,
      );
    }

    setSubmitting(
      true,
    );

    try {
      const response =
        await fetch(
          `/api/reviews/${encodeURIComponent(
            token,
          )}`,
          {
            method:
              "POST",

            body:
              formData,
          },
        );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "No fue posible enviar tu reseña.",
        );
      }

      setSuccess(
        true,
      );
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : "Ocurrió un error inesperado.",
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  if (success) {
    return (
      <div
        className="
          rounded-[2rem]
          border
          border-brand-green/15
          bg-brand-green/[0.05]
          p-7
          text-center
          sm:p-10
        "
      >
        <div
          className="
            mx-auto
            flex
            h-14
            w-14
            items-center
            justify-center
            rounded-full
            bg-brand-green
            text-xl
            text-white
          "
        >
          ✓
        </div>

        <h2
          className="
            mt-5
            font-display
            text-4xl
            font-semibold
            text-brand-brown
          "
        >
          Gracias por compartir
          tu experiencia.
        </h2>

        <p
          className="
            mx-auto
            mt-4
            max-w-[560px]
            text-sm
            leading-7
            text-brand-brown/55
          "
        >
          Tu testimonio fue enviado
          correctamente. Edna lo
          revisará antes de que pueda
          aparecer públicamente.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={
        handleSubmit
      }
      className="
        rounded-[2rem]
        border
        border-brand-taupe/25
        bg-white/65
        p-6
        shadow-[0_24px_70px_rgba(59,42,36,0.06)]
        sm:p-9
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
        {serviceName}
      </p>

      {/* NOMBRE */}

      <div className="mt-8">
        <label
          htmlFor="review-name"
          className="
            text-sm
            font-semibold
            text-brand-brown
          "
        >
          Nombre
        </label>

        <input
          id="review-name"
          type="text"
          value={
            authorName
          }
          maxLength={
            100
          }
          required
          onChange={(
            event,
          ) =>
            setAuthorName(
              event.target
                .value,
            )
          }
          className="
            mt-2
            w-full
            rounded-xl
            border
            border-brand-taupe/30
            bg-brand-cream/40
            px-4
            py-3.5
            outline-none
            transition
            focus:border-brand-wine
          "
        />
      </div>

      {/* ESTRELLAS */}

      <fieldset className="mt-8">
        <legend
          className="
            text-sm
            font-semibold
            text-brand-brown
          "
        >
          ¿Cómo fue tu
          experiencia?
        </legend>

        <div
          className="
            mt-3
            flex
            gap-1
          "
        >
          {[
            1,
            2,
            3,
            4,
            5,
          ].map(
            (value) => (
              <button
                key={
                  value
                }
                type="button"
                aria-label={`${value} estrella${
                  value ===
                  1
                    ? ""
                    : "s"
                }`}
                onClick={() =>
                  setRating(
                    value,
                  )
                }
                className="
                  text-4xl
                  transition
                  hover:scale-110
                "
              >
                <span
                  className={
                    value <=
                    rating
                      ? "text-[#B18A3D]"
                      : "text-brand-taupe/30"
                  }
                >
                  ★
                </span>
              </button>
            ),
          )}
        </div>
      </fieldset>

      {/* RESEÑA */}

      <div className="mt-8">
        <div
          className="
            flex
            items-center
            justify-between
            gap-4
          "
        >
          <label
            htmlFor="review-content"
            className="
              text-sm
              font-semibold
              text-brand-brown
            "
          >
            Cuéntanos tu
            experiencia
          </label>

          <span
            className="
              text-xs
              text-brand-brown/35
            "
          >
            {
              content.length
            }
            /2000
          </span>
        </div>

        <textarea
          id="review-content"
          required
          minLength={
            10
          }
          maxLength={
            2000
          }
          rows={
            7
          }
          value={
            content
          }
          onChange={(
            event,
          ) =>
            setContent(
              event.target
                .value,
            )
          }
          placeholder="¿Qué cambió, qué valoraste del proceso o cómo fue tu experiencia?"
          className="
            mt-2
            w-full
            resize-y
            rounded-xl
            border
            border-brand-taupe/30
            bg-brand-cream/40
            px-4
            py-3.5
            leading-7
            outline-none
            transition
            placeholder:text-brand-brown/30
            focus:border-brand-wine
          "
        />
      </div>

      {/* FOTO / AVATAR */}

      <fieldset className="mt-8">
        <legend
          className="
            text-sm
            font-semibold
            text-brand-brown
          "
        >
          ¿Cómo quieres
          aparecer?
        </legend>

        <div
          className="
            mt-3
            grid
            gap-3
            sm:grid-cols-2
          "
        >
          <button
            type="button"
            onClick={() =>
              setIdentityMode(
                "avatar",
              )
            }
            className={`
              rounded-xl
              border
              px-5
              py-4
              text-left
              transition

              ${
                identityMode ===
                "avatar"
                  ? "border-brand-wine bg-brand-wine/[0.05]"
                  : "border-brand-taupe/25"
              }
            `}
          >
            <span
              className="
                block
                font-semibold
                text-brand-brown
              "
            >
              Usar un avatar
            </span>

            <span
              className="
                mt-1
                block
                text-xs
                text-brand-brown/45
              "
            >
              No necesitas
              subir una foto.
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              setIdentityMode(
                "photo",
              )
            }
            className={`
              rounded-xl
              border
              px-5
              py-4
              text-left
              transition

              ${
                identityMode ===
                "photo"
                  ? "border-brand-wine bg-brand-wine/[0.05]"
                  : "border-brand-taupe/25"
              }
            `}
          >
            <span
              className="
                block
                font-semibold
                text-brand-brown
              "
            >
              Subir mi foto
            </span>

            <span
              className="
                mt-1
                block
                text-xs
                text-brand-brown/45
              "
            >
              Se optimizará
              automáticamente.
            </span>
          </button>
        </div>

        {identityMode ===
          "avatar" && (
          <div
            className="
              mt-5
              grid
              grid-cols-3
              gap-3
              sm:grid-cols-6
            "
          >
            {REVIEW_AVATARS.map(
              (
                avatar,
              ) => (
                <button
                  key={
                    avatar.key
                  }
                  type="button"
                  onClick={() =>
                    setAvatarKey(
                      avatar.key,
                    )
                  }
                  className={`
                    rounded-2xl
                    border
                    p-3
                    transition

                    ${
                      avatarKey ===
                      avatar.key
                        ? "border-brand-wine bg-brand-wine/[0.05]"
                        : "border-brand-taupe/20"
                    }
                  `}
                >
                  <ReviewAvatar
                    avatarKey={
                      avatar.key
                    }
                    className="
                      mx-auto
                      w-14
                    "
                  />

                  <span
                    className="
                      mt-2
                      block
                      text-[0.65rem]
                      font-semibold
                      text-brand-brown/60
                    "
                  >
                    {
                      avatar.label
                    }
                  </span>
                </button>
              ),
            )}
          </div>
        )}

        {identityMode ===
          "photo" && (
          <div
            className="
              mt-5
              rounded-2xl
              border
              border-brand-taupe/25
              p-5
            "
          >
            <div
              className="
                flex
                flex-col
                gap-5
                sm:flex-row
                sm:items-center
              "
            >
              <div
                className="
                  flex
                  h-24
                  w-24
                  shrink-0
                  items-center
                  justify-center
                  overflow-hidden
                  rounded-full
                  bg-brand-taupe/15
                "
              >
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      previewUrl
                    }
                    alt="Vista previa"
                    className="
                      h-full
                      w-full
                      object-cover
                    "
                  />
                ) : (
                  <span
                    className="
                      text-2xl
                      text-brand-brown/25
                    "
                  >
                    +
                  </span>
                )}
              </div>

              <div>
                <input
                  type="file"
                  accept="
                    image/jpeg,
                    image/png,
                    image/webp,
                    image/heic,
                    image/heif
                  "
                  onChange={(
                    event,
                  ) =>
                    handlePhoto(
                      event
                        .target
                        .files?.[0] ??
                        null,
                    )
                  }
                  className="
                    block
                    max-w-full
                    text-sm
                    text-brand-brown/60
                  "
                />

                <p
                  className="
                    mt-2
                    text-xs
                    leading-5
                    text-brand-brown/40
                  "
                >
                  Máximo 4 MB.
                  La imagen se
                  recortará en
                  formato cuadrado
                  y se convertirá
                  automáticamente
                  a WebP.
                </p>
              </div>
            </div>
          </div>
        )}
      </fieldset>

      {/* CONSENTIMIENTO */}

      <label
        className="
          mt-8
          flex
          cursor-pointer
          items-start
          gap-3
          rounded-xl
          bg-brand-taupe/10
          p-4
        "
      >
        <input
          type="checkbox"
          checked={
            consent
          }
          onChange={(
            event,
          ) =>
            setConsent(
              event.target
                .checked,
            )
          }
          className="
            mt-1
            h-4
            w-4
            accent-brand-wine
          "
        />

        <span
          className="
            text-sm
            leading-6
            text-brand-brown/60
          "
        >
          Autorizo que mi
          nombre, calificación,
          testimonio y la foto
          o avatar que elegí
          puedan mostrarse
          públicamente en el
          sitio de ER Coaching.
        </span>
      </label>

      {error && (
        <p
          role="alert"
          className="
            mt-5
            rounded-xl
            bg-brand-wine/[0.06]
            p-4
            text-sm
            text-brand-wine
          "
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={
          submitting
        }
        className="
          mt-7
          inline-flex
          min-h-[52px]
          w-full
          items-center
          justify-center
          rounded-xl
          bg-brand-wine
          px-6
          font-semibold
          text-white
          transition
          hover:opacity-90
          disabled:cursor-not-allowed
          disabled:opacity-50
        "
      >
        {submitting
          ? "Enviando..."
          : "Enviar mi testimonio"}
      </button>
    </form>
  );
}
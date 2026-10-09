"use client";

import {
  type FormEvent,
  useState,
} from "react";

type ContactResponse = {
  success?: boolean;
  error?: string;
};

const SUBJECTS = [
  {
    value: "individual",
    label: "Sesión individual",
  },
  {
    value: "process",
    label: "Proceso de coaching",
  },
  {
    value: "group",
    label: "Taller o sesión grupal",
  },
  {
    value: "other",
    label: "Otra consulta",
  },
] as const;

export default function ContactForm() {
  const [
    name,
    setName,
  ] = useState("");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    subject,
    setSubject,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  /*
    Campo honeypot invisible.
    Un bot normalmente intentará llenarlo.
  */
  const [
    company,
    setCompany,
  ] = useState("");

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");

    const cleanName =
      name.trim();

    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    const cleanMessage =
      message.trim();

    if (
      cleanName.length <
      2
    ) {
      setError(
        "Ingresa tu nombre.",
      );

      return;
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        cleanEmail,
      )
    ) {
      setError(
        "Ingresa un correo electrónico válido.",
      );

      return;
    }

    if (!subject) {
      setError(
        "Selecciona el motivo de tu mensaje.",
      );

      return;
    }

    if (
      cleanMessage.length <
      10
    ) {
      setError(
        "Cuéntanos un poco más sobre tu consulta.",
      );

      return;
    }

    try {
      setSubmitting(
        true,
      );

      const response =
        await fetch(
          "/api/contact",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                name:
                  cleanName,

                email:
                  cleanEmail,

                subject,

                message:
                  cleanMessage,

                company,
              }),
          },
        );

      let result:
        | ContactResponse
        | null = null;

      try {
        result =
          (await response.json()) as ContactResponse;
      } catch {
        result =
          null;
      }

      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.error ??
            "No fue posible enviar tu mensaje.",
        );
      }

      setSuccess(
        true,
      );

      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setCompany("");
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : "No fue posible enviar tu mensaje.",
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
          flex
          min-h-[540px]
          flex-col
          items-center
          justify-center

          rounded-[2rem]

          border
          border-brand-green/15

          bg-white/60

          p-8
          text-center

          sm:p-12
        "
      >
        <div
          className="
            flex
            h-16
            w-16
            items-center
            justify-center

            rounded-full

            bg-brand-green

            text-2xl
            text-white
          "
        >
          ✓
        </div>

        <p
          className="
            mt-7
            text-xs
            font-semibold
            uppercase
            tracking-[0.25em]
            text-brand-green
          "
        >
          Mensaje enviado
        </p>

        <h2
          className="
            mt-3
            max-w-[500px]
            font-display
            text-4xl
            font-semibold
            leading-tight
            text-brand-brown
            sm:text-5xl
          "
        >
          Gracias por escribirme.
        </h2>

        <p
          className="
            mt-5
            max-w-[500px]
            text-sm
            leading-7
            text-brand-brown/55
            sm:text-base
          "
        >
          Tu mensaje fue recibido correctamente.
          También recibirás una confirmación en el
          correo que proporcionaste.
        </p>

        <button
          type="button"
          onClick={() =>
            setSuccess(
              false,
            )
          }
          className="
            mt-8
            text-sm
            font-semibold
            text-brand-wine
            underline
            underline-offset-4
          "
        >
          Enviar otro mensaje
        </button>
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

        shadow-[0_24px_70px_rgba(59,42,36,0.05)]

        sm:p-8
        lg:p-10
      "
    >
      <div>
        <p
          className="
            text-xs
            font-semibold
            uppercase
            tracking-[0.25em]
            text-brand-wine
          "
        >
          Escríbeme
        </p>

        <h2
          className="
            mt-3
            font-display
            text-3xl
            font-semibold
            text-brand-brown
            sm:text-4xl
          "
        >
          ¿En qué puedo ayudarte?
        </h2>
      </div>

      {/* HONEYPOT */}

      <div
        aria-hidden="true"
        className="
          absolute
          left-[-9999px]
          top-auto
          h-px
          w-px
          overflow-hidden
        "
      >
        <label htmlFor="contact-company">
          Empresa
        </label>

        <input
          id="contact-company"
          type="text"
          value={
            company
          }
          tabIndex={
            -1
          }
          autoComplete="off"
          onChange={(
            event,
          ) =>
            setCompany(
              event.target
                .value,
            )
          }
        />
      </div>

      {/* NOMBRE + EMAIL */}

      <div
        className="
          mt-8
          grid
          gap-6
          md:grid-cols-2
        "
      >
        <div>
          <label
            htmlFor="contact-name"
            className="
              text-sm
              font-semibold
              text-brand-brown
            "
          >
            Nombre
          </label>

          <input
            id="contact-name"
            type="text"
            autoComplete="name"
            required
            maxLength={
              100
            }
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
            placeholder="Tu nombre"
            className="
              mt-2
              w-full

              rounded-xl

              border
              border-brand-taupe/30

              bg-brand-cream/45

              px-4
              py-3.5

              text-brand-brown

              outline-none

              transition-colors

              placeholder:text-brand-brown/30

              focus:border-brand-wine
            "
          />
        </div>

        <div>
          <label
            htmlFor="contact-email"
            className="
              text-sm
              font-semibold
              text-brand-brown
            "
          >
            Correo electrónico
          </label>

          <input
            id="contact-email"
            type="email"
            autoComplete="email"
            required
            maxLength={
              254
            }
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
            placeholder="tu@correo.com"
            className="
              mt-2
              w-full

              rounded-xl

              border
              border-brand-taupe/30

              bg-brand-cream/45

              px-4
              py-3.5

              text-brand-brown

              outline-none

              transition-colors

              placeholder:text-brand-brown/30

              focus:border-brand-wine
            "
          />
        </div>
      </div>

      {/* MOTIVO */}

      <div className="mt-6">
        <label
          htmlFor="contact-subject"
          className="
            text-sm
            font-semibold
            text-brand-brown
          "
        >
          Motivo
        </label>

        <select
          id="contact-subject"
          required
          value={
            subject
          }
          onChange={(
            event,
          ) =>
            setSubject(
              event.target
                .value,
            )
          }
          className="
            mt-2
            min-h-[52px]
            w-full

            rounded-xl

            border
            border-brand-taupe/30

            bg-brand-cream/45

            px-4

            text-brand-brown

            outline-none

            focus:border-brand-wine
          "
        >
          <option value="">
            Selecciona una opción
          </option>

          {SUBJECTS.map(
            (
              item,
            ) => (
              <option
                key={
                  item.value
                }
                value={
                  item.value
                }
              >
                {
                  item.label
                }
              </option>
            ),
          )}
        </select>
      </div>

      {/* MENSAJE */}

      <div className="mt-6">
        <div
          className="
            flex
            items-center
            justify-between
            gap-4
          "
        >
          <label
            htmlFor="contact-message"
            className="
              text-sm
              font-semibold
              text-brand-brown
            "
          >
            Mensaje
          </label>

          <span
            className="
              text-xs
              text-brand-brown/35
            "
          >
            {message.length}
            /2000
          </span>
        </div>

        <textarea
          id="contact-message"
          rows={
            7
          }
          required
          minLength={
            10
          }
          maxLength={
            2000
          }
          value={
            message
          }
          onChange={(
            event,
          ) =>
            setMessage(
              event.target
                .value,
            )
          }
          placeholder="Cuéntame brevemente cómo puedo ayudarte..."
          className="
            mt-2
            w-full
            resize-y

            rounded-xl

            border
            border-brand-taupe/30

            bg-brand-cream/45

            px-4
            py-3.5

            leading-7

            text-brand-brown

            outline-none

            transition-colors

            placeholder:text-brand-brown/30

            focus:border-brand-wine
          "
        />
      </div>

      {/* ERROR */}

      {error && (
        <div
          role="alert"
          className="
            mt-6

            rounded-xl

            border
            border-brand-wine/15

            bg-brand-wine/[0.05]

            px-4
            py-3

            text-sm
            leading-6

            text-brand-wine
          "
        >
          {error}
        </div>
      )}

      {/* BOTÓN */}

      <div
        className="
          mt-8
          flex
          flex-col
          gap-5

          border-t
          border-brand-taupe/20

          pt-6

          sm:flex-row
          sm:items-center
          sm:justify-between
        "
      >
        <p
          className="
            max-w-[430px]
            text-xs
            leading-5
            text-brand-brown/40
          "
        >
          Tus datos se utilizarán únicamente para
          responder a esta consulta.
        </p>

        <button
          type="submit"
          disabled={
            submitting
          }
          className="
            group

            flex
            min-h-[54px]
            min-w-[210px]
            items-center
            justify-between
            gap-7

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
          <span>
            {submitting
              ? "Enviando..."
              : "Enviar mensaje"}
          </span>

          {!submitting && (
            <span
              className="
                transition-transform
                duration-200
                group-hover:translate-x-1
              "
            >
              →
            </span>
          )}
        </button>
      </div>
    </form>
  );
}
"use client";

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type CancelBookingButtonProps = {
  bookingId: string;

  bookingReference:
    | string
    | null;

  customerName: string;

  onCancelled?: () => void;
};

export default function CancelBookingButton({
  bookingId,
  bookingReference,
  customerName,
  onCancelled,
}: CancelBookingButtonProps) {
  const router =
    useRouter();

  const [
    confirmOpen,
    setConfirmOpen,
  ] =
    useState(false);

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

  async function cancelBooking() {
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/admin/bookings/${encodeURIComponent(
            bookingId,
          )}/cancel`,
          {
            method: "POST",
          },
        );

      const data =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          data?.error ||
            "No fue posible cancelar la reserva.",
        );
      }

      setConfirmOpen(false);

      onCancelled?.();

      /*
        Vuelve a ejecutar los Server
        Components y trae el estado
        actualizado desde Supabase.
      */
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No fue posible cancelar la reserva.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setConfirmOpen(true);
        }}
        className="
          inline-flex
          min-h-[48px]
          items-center
          justify-center
          rounded-full
          border
          border-[#8A3535]/25
          px-5
          text-sm
          font-semibold
          text-[#8A3535]
          transition
          hover:border-[#8A3535]/50
          hover:bg-[#F7E8E8]
        "
      >
        Cancelar reserva
      </button>

      {confirmOpen && (
        <div
          className="
            fixed
            inset-0
            z-[100]
            flex
            items-center
            justify-center
            bg-black/35
            px-5
          "
          role="presentation"
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
              event.currentTarget &&
              !loading
            ) {
              setConfirmOpen(
                false,
              );
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-booking-title"
            className="
              w-full
              max-w-[480px]
              rounded-[1.75rem]
              bg-[#f7f5f1]
              p-6
              shadow-2xl
              sm:p-8
            "
          >
            <p
              className="
                text-xs
                font-semibold
                uppercase
                tracking-[0.18em]
                text-[#8A3535]
              "
            >
              Cancelar reserva
            </p>

            <h2
              id="cancel-booking-title"
              className="
                mt-3
                font-display
                text-3xl
                font-semibold
                text-brand-brown
              "
            >
              ¿Cancelar esta sesión?
            </h2>

            <p
              className="
                mt-4
                text-sm
                leading-6
                text-brand-brown/60
              "
            >
              Se cancelará la
              reserva de{" "}
              <strong className="text-brand-brown">
                {customerName}
              </strong>
              {bookingReference
                ? ` (${bookingReference})`
                : ""}
              .
            </p>

            <div
              className="
                mt-5
                rounded-2xl
                bg-[#F7E8E8]
                p-4
              "
            >
              <p
                className="
                  text-sm
                  leading-6
                  text-[#8A3535]
                "
              >
                El evento será eliminado
                de Google Calendar y
                Google enviará la
                cancelación al cliente.
                El horario volverá a
                quedar disponible.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="
                  mt-4
                  rounded-2xl
                  border
                  border-[#8A3535]/15
                  bg-[#F7E8E8]
                  px-4
                  py-3
                  text-sm
                  leading-6
                  text-[#8A3535]
                "
              >
                {error}
              </div>
            )}

            <div
              className="
                mt-7
                flex
                flex-col-reverse
                gap-3
                sm:flex-row
                sm:justify-end
              "
            >
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  setConfirmOpen(
                    false,
                  )
                }
                className="
                  min-h-[48px]
                  rounded-full
                  border
                  border-brand-brown/15
                  px-5
                  text-sm
                  font-semibold
                  text-brand-brown
                  transition
                  hover:bg-brand-brown/5
                  disabled:opacity-50
                "
              >
                Volver
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={
                  cancelBooking
                }
                className="
                  min-h-[48px]
                  rounded-full
                  bg-[#8A3535]
                  px-5
                  text-sm
                  font-semibold
                  text-white
                  transition
                  hover:bg-[#6F2929]
                  disabled:cursor-not-allowed
                  disabled:opacity-60
                "
              >
                {loading
                  ? "Cancelando..."
                  : "Sí, cancelar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
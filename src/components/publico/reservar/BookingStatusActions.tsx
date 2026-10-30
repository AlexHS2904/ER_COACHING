"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { holdRemainingSeconds, formatHoldRemaining } from "@/lib/bookings/hold-countdown";
import BookingLegalAcceptance from "@/components/legal/BookingLegalAcceptance";
import { currentBookingAcceptance } from "@/lib/legal/acceptance";

export default function BookingStatusActions({ bookingId, refresh, canPay, paymentExpiresAt, serverNow, redirectIntakeUrl,
  legalAccepted, processing = false }: {
  bookingId: string; refresh: boolean; canPay: boolean;
  paymentExpiresAt: string | null; serverNow: number; redirectIntakeUrl: string | null;
  legalAccepted: boolean; processing?: boolean;
}) {
  const router = useRouter();
  const lock = useRef(false);
  const checkedDeadline = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [remaining, setRemaining] = useState(() => paymentExpiresAt ? holdRemainingSeconds(paymentExpiresAt, serverNow) : 0);
  useEffect(() => {
    if (!redirectIntakeUrl) return;
    // Leave the payment-status router state behind and load the authorized form.
    // The visible link remains usable if the browser blocks automatic navigation.
    try { window.location.replace(redirectIntakeUrl); } catch { /* Use the link below. */ }
  }, [redirectIntakeUrl]);
  useEffect(() => {
    if (!paymentExpiresAt) return;
    const anchor = performance.now();
    const tick = () => {
      const seconds = holdRemainingSeconds(paymentExpiresAt, serverNow, performance.now() - anchor);
      setRemaining(seconds);
      if (seconds === 0 && checkedDeadline.current !== paymentExpiresAt) {
        checkedDeadline.current = paymentExpiresAt;
        router.refresh();
      }
    };
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, [paymentExpiresAt, serverNow, router]);
  useEffect(() => {
    if (!refresh) return;
    const timer = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [refresh, router]);
  async function resume() {
    if (lock.current || processing) return;
    if (!legalAccepted && !termsAccepted) {
      setError("Lee y acepta los Términos y Condiciones antes de continuar.");
      return;
    }
    lock.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/bookings/stripe/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, ...(!legalAccepted ? { legalAcceptance: currentBookingAcceptance } : {}) }),
      });
      const result = await response.json();
      if (response.ok && typeof result.redirectIntakeUrl === "string") {
        const target = new URL(result.redirectIntakeUrl, window.location.origin);
        if (target.origin !== window.location.origin || target.username || target.password ||
            !/^\/formulario\/[a-f0-9]{64}$/.test(target.pathname) || target.search || target.hash) {
          throw new Error("No fue posible verificar el acceso al formulario.");
        }
        window.location.replace(target.toString());
        return;
      }
      if (typeof result.statusUrl === "string" && /^\/reservar\/confirmada(?:\?|$)/.test(result.statusUrl)) {
        router.replace(result.statusUrl);
        router.refresh();
        lock.current = false;
        setLoading(false);
        if (!response.ok) {
          setError(result.error ?? "No fue posible preparar el pago. Puedes reintentarlo mientras tu horario siga apartado.");
        }
        return;
      }
      if (!response.ok || !result.checkoutUrl) throw new Error(result.error ?? "No fue posible recuperar Checkout.");
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No fue posible recuperar Checkout.");
      lock.current = false;
      setLoading(false);
    }
  }
  return <>
    {paymentExpiresAt && <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-brand-wine/15 bg-white/60 p-5">
      <p className="text-sm text-brand-brown/70">Tiempo restante para completar tu pago</p>
      <p className="mt-2 font-display text-4xl tabular-nums text-brand-wine" role="timer" aria-label="Tiempo restante">{formatHoldRemaining(remaining)}</p>
      {remaining === 0 && <p className="mt-2 text-sm text-brand-brown/70">Estamos verificando el estado de tu reserva…</p>}
    </div>}
    {(redirectIntakeUrl || processing || (refresh && !canPay && !paymentExpiresAt)) &&
      <span className="mt-6 inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-wine/20 border-t-brand-wine" role="status" aria-label={redirectIntakeUrl ? "Redirigiendo al formulario" : "Preparando tu sesión"} />}
    {redirectIntakeUrl && <a href={redirectIntakeUrl} referrerPolicy="no-referrer"
      className="mt-6 inline-flex rounded-xl bg-brand-wine px-6 py-3 font-semibold text-white">
      Continuar al formulario
    </a>}
    {canPay && !processing && remaining > 0 && <div className="mx-auto max-w-lg">
      {!legalAccepted && <BookingLegalAcceptance checked={termsAccepted} onChange={setTermsAccepted} />}
      <button type="button" disabled={loading || (!legalAccepted && !termsAccepted)} onClick={resume}
      className="mt-6 rounded-xl bg-brand-wine px-6 py-3 font-semibold text-white disabled:opacity-50">
      {loading ? "Preparando pago…" : "Reintentar pago"}
    </button></div>}
    {error && <p role="alert" className="mt-4 text-brand-wine">{error}</p>}
  </>;
}

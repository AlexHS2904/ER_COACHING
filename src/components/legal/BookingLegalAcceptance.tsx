"use client";

export default function BookingLegalAcceptance({ checked, onChange, concise = false }: {
  checked: boolean; onChange: (accepted: boolean) => void; concise?: boolean;
}) {
  return <div className="mt-6 space-y-3 text-left text-sm leading-6 text-brand-brown/80">
    <label className="flex items-start gap-3">
      <input type="checkbox" name="termsAccepted" required checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-brand-wine" />
      <span>Confirmo que tengo 18 años o más y que he leído y acepto los{" "}
        <a href="/terminos-y-condiciones" target="_blank" rel="noopener noreferrer"
          className="text-brand-wine underline">Términos y Condiciones</a>.
      </span>
    </label>
    <p>{concise ? "Consulta nuestro" : "Consulta cómo tratamos tus datos en el"}{" "}
      <a href="/aviso-de-privacidad" target="_blank" rel="noopener noreferrer"
        className="text-brand-wine underline">Aviso de Privacidad</a>.
      {!concise && " Esta aceptación no autoriza publicidad ni sustituye el consentimiento del formulario previo."}
    </p>
  </div>;
}

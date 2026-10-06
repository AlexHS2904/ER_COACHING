"use client";

import {
  type ReactNode,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

export type AdminService = {
  id: string;

  name: string;
  slug: string;

  short_description:
    string;

  description:
    | string
    | null;

  service_type:
    | "single"
    | "package"
    | "group";

  duration_minutes:
    | number
    | null;

  session_count:
    | number
    | null;

  price:
    | number
    | null;

  currency: string;

  requires_quote:
    boolean;

  booking_enabled:
    boolean;

  active: boolean;

  display_order:
    number;
};

type ServiceForm = {
  name: string;

  serviceType:
    AdminService["service_type"];

  shortDescription:
    string;

  description:
    string;

  durationMinutes:
    string;

  sessionCount:
    string;

  price:
    string;

  currency:
    string;

  requiresQuote:
    boolean;

  bookingEnabled:
    boolean;

  active:
    boolean;

  displayOrder:
    string;
};

type ServicesManagerProps = {
  initialServices:
    AdminService[];
};

type EditorMode =
  | "create"
  | "edit"
  | null;

/* =========================================================
   HELPERS
========================================================= */

function getTypeLabel(
  type:
    AdminService["service_type"],
) {
  if (
    type === "single"
  ) {
    return "Sesión individual";
  }

  if (
    type === "package"
  ) {
    return "Proceso / paquete";
  }

  return "Grupal";
}

function formatPrice(
  service:
    AdminService,
) {
  if (
    service.requires_quote
  ) {
    return "Cotización";
  }

  if (
    service.price === null
  ) {
    return "Sin precio";
  }

  return new Intl.NumberFormat(
    "es-MX",
    {
      style:
        "currency",

      currency:
        service.currency,

      maximumFractionDigits:
        0,
    },
  ).format(
    service.price,
  );
}

function createEditForm(
  service:
    AdminService,
): ServiceForm {
  return {
    name:
      service.name,

    serviceType:
      service.service_type,

    shortDescription:
      service.short_description,

    description:
      service.description ??
      "",

    durationMinutes:
      service.duration_minutes !==
      null
        ? String(
            service.duration_minutes,
          )
        : "",

    sessionCount:
      service.session_count !==
      null
        ? String(
            service.session_count,
          )
        : "",

    price:
      service.price !==
      null
        ? String(
            service.price,
          )
        : "",

    currency:
      service.currency,

    requiresQuote:
      service.requires_quote,

    bookingEnabled:
      service.booking_enabled,

    active:
      service.active,

    displayOrder:
      String(
        service.display_order,
      ),
  };
}

function createNewForm(
  order: number,
): ServiceForm {
  return {
    name: "",

    serviceType:
      "single",

    shortDescription:
      "",

    description:
      "",

    durationMinutes:
      "90",

    sessionCount:
      "1",

    price:
      "",

    currency:
      "MXN",

    requiresQuote:
      false,

    bookingEnabled:
      true,

    active:
      true,

    displayOrder:
      String(order),
  };
}

/* =========================================================
   COMPONENT
========================================================= */

export default function ServicesManager({
  initialServices,
}: ServicesManagerProps) {
  const router =
    useRouter();

  const [
    services,
    setServices,
  ] =
    useState(
      initialServices,
    );

  const [
    mode,
    setMode,
  ] =
    useState<EditorMode>(
      null,
    );

  const [
    editing,
    setEditing,
  ] =
    useState<
      AdminService | null
    >(null);

  const [
    form,
    setForm,
  ] =
    useState<
      ServiceForm | null
    >(null);

  const [
    saving,
    setSaving,
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
    useState("");

  const [
    pageError,
    setPageError,
  ] =
    useState("");

  const [
    pageSuccess,
    setPageSuccess,
  ] =
    useState("");

  const activeServices =
    useMemo(
      () =>
        services
          .filter(
            (service) =>
              service.active,
          )
          .sort(
            (a, b) =>
              a.display_order -
              b.display_order,
          ),
      [services],
    );

  const archivedServices =
    useMemo(
      () =>
        services
          .filter(
            (service) =>
              !service.active,
          )
          .sort(
            (a, b) =>
              a.display_order -
              b.display_order,
          ),
      [services],
    );

  /* =======================================================
     EDITOR
  ======================================================= */

  function openCreate() {
    const maxOrder =
      services.reduce(
        (
          highest,
          service,
        ) =>
          Math.max(
            highest,
            service.display_order,
          ),
        0,
      );

    setMode(
      "create",
    );

    setEditing(
      null,
    );

    setForm(
      createNewForm(
        maxOrder + 1,
      ),
    );

    setError("");
    setSuccess("");
  }

  function openEdit(
    service:
      AdminService,
  ) {
    setMode(
      "edit",
    );

    setEditing(
      service,
    );

    setForm(
      createEditForm(
        service,
      ),
    );

    setError("");
    setSuccess("");
  }

  function closeEditor() {
    if (saving) {
      return;
    }

    setMode(null);
    setEditing(null);
    setForm(null);

    setError("");
    setSuccess("");
  }

  function updateForm<
    K extends keyof ServiceForm,
  >(
    key: K,
    value:
      ServiceForm[K],
  ) {
    setForm(
      (current) =>
        current
          ? {
              ...current,

              [key]:
                value,
            }
          : current,
    );
  }

  function changeServiceType(
    type:
      AdminService["service_type"],
  ) {
    setForm(
      (current) => {
        if (!current) {
          return current;
        }

        if (
          type ===
          "single"
        ) {
          return {
            ...current,

            serviceType:
              type,

            durationMinutes:
              current.durationMinutes ||
              "90",

            sessionCount:
              "1",

            requiresQuote:
              false,

            bookingEnabled:
              true,
          };
        }

        if (
          type ===
          "package"
        ) {
          return {
            ...current,

            serviceType:
              type,

            durationMinutes:
              current.durationMinutes ||
              "90",

            sessionCount:
              current.sessionCount &&
              current.sessionCount !==
                "1"
                ? current.sessionCount
                : "6",

            requiresQuote:
              false,

            bookingEnabled:
              true,
          };
        }

        return {
          ...current,

          serviceType:
            "group",

          durationMinutes:
            "",

          sessionCount:
            "",

          price:
            "",

          requiresQuote:
            true,

          bookingEnabled:
            false,
        };
      },
    );
  }

  function toggleQuote(
    checked:
      boolean,
  ) {
    setForm(
      (current) =>
        current
          ? {
              ...current,

              requiresQuote:
                checked,

              bookingEnabled:
                checked
                  ? false
                  : current.bookingEnabled,

              price:
                checked
                  ? ""
                  : current.price,
            }
          : current,
    );
  }

  /* =======================================================
     CREAR / EDITAR
  ======================================================= */

  async function saveService() {
    if (
      !form ||
      !mode ||
      saving
    ) {
      return;
    }

    if (
      mode ===
        "edit" &&
      !editing
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        name:
          form.name,

        shortDescription:
          form.shortDescription,

        description:
          form.description,

        durationMinutes:
          form.durationMinutes ===
          ""
            ? null
            : Number(
                form.durationMinutes,
              ),

        sessionCount:
          form.sessionCount ===
          ""
            ? null
            : Number(
                form.sessionCount,
              ),

        price:
          form.price ===
          ""
            ? null
            : Number(
                form.price,
              ),

        currency:
          form.currency,

        requiresQuote:
          form.requiresQuote,

        bookingEnabled:
          form.bookingEnabled,

        active:
          form.active,

        displayOrder:
          Number(
            form.displayOrder,
          ),
      };

      const url =
        mode ===
        "create"
          ? "/api/admin/services"
          : `/api/admin/services/${encodeURIComponent(
              editing!.id,
            )}`;

      const response =
        await fetch(
          url,
          {
            method:
              mode ===
              "create"
                ? "POST"
                : "PUT",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                mode ===
                  "create"
                  ? {
                      ...payload,

                      serviceType:
                        form.serviceType,
                    }
                  : payload,
              ),
          },
        );

      let data:
        | {
            error?: string;

            service?:
              AdminService;
          }
        | undefined;

      try {
        data =
          await response.json();
      } catch {
        data =
          undefined;
      }

      if (
        !response.ok ||
        !data?.service
      ) {
        throw new Error(
          data?.error ||
            "No fue posible guardar el servicio.",
        );
      }

      const saved =
        data.service;

      setServices(
        (current) => {
          if (
            mode ===
            "create"
          ) {
            return [
              ...current,
              saved,
            ];
          }

          return current.map(
            (service) =>
              service.id ===
              saved.id
                ? saved
                : service,
          );
        },
      );

      setEditing(
        saved,
      );

      setForm(
        createEditForm(
          saved,
        ),
      );

      setMode(
        "edit",
      );

      setSuccess(
        mode ===
        "create"
          ? "Servicio creado correctamente."
          : "Servicio actualizado correctamente.",
      );

      router.refresh();
    } catch (error) {
      setError(
        error instanceof
          Error
          ? error.message
          : "No fue posible guardar el servicio.",
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  /* =======================================================
     ARCHIVAR / RESTAURAR
  ======================================================= */

  async function changeArchivedState(
    service:
      AdminService,

    action:
      | "archive"
      | "restore",
  ) {
    setPageError("");
    setPageSuccess("");

    if (
      action ===
      "archive"
    ) {
      const confirmed =
        window.confirm(
          `¿Archivar "${service.name}"?\n\nDejará de estar disponible para nuevos clientes, pero conservará todo su historial.`,
        );

      if (!confirmed) {
        return;
      }
    }

    try {
      const response =
        await fetch(
          `/api/admin/services/${encodeURIComponent(
            service.id,
          )}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                action,
              }),
          },
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data?.service
      ) {
        throw new Error(
          data?.error ||
            "No fue posible actualizar el servicio.",
        );
      }

      const updated =
        data.service as
          AdminService;

      setServices(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              updated.id
                ? updated
                : item,
          ),
      );

      setPageSuccess(
        action ===
        "archive"
          ? "Servicio archivado."
          : "Servicio restaurado.",
      );

      router.refresh();
    } catch (error) {
      setPageError(
        error instanceof
          Error
          ? error.message
          : "No fue posible actualizar el servicio.",
      );
    }
  }

  /* =======================================================
     ELIMINAR
  ======================================================= */

  async function deleteService(
    service:
      AdminService,
  ) {
    setPageError("");
    setPageSuccess("");

    const confirmed =
      window.confirm(
        `¿Eliminar definitivamente "${service.name}"?\n\nEsta acción solo funcionará si el servicio nunca ha tenido reservas y no se puede deshacer.`,
      );

    if (!confirmed) {
      return;
    }

    try {
      const response =
        await fetch(
          `/api/admin/services/${encodeURIComponent(
            service.id,
          )}`,
          {
            method:
              "DELETE",
          },
        );

      let data:
        | {
            error?: string;
          }
        | undefined;

      try {
        data =
          await response.json();
      } catch {
        data =
          undefined;
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No fue posible eliminar el servicio.",
        );
      }

      setServices(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              service.id,
          ),
      );

      setPageSuccess(
        "Servicio eliminado definitivamente.",
      );

      router.refresh();
    } catch (error) {
      setPageError(
        error instanceof
          Error
          ? error.message
          : "No fue posible eliminar el servicio.",
      );
    }
  }

  return (
    <>
      {/* HEADER ACTION */}

      <div
        className="
          mb-7
          flex
          flex-col
          gap-4
          sm:flex-row
          sm:items-center
          sm:justify-between
        "
      >
        <div>
          <p
            className="
              text-sm
              text-brand-brown/45
            "
          >
            {activeServices.length}{" "}
            {activeServices.length ===
            1
              ? "servicio activo"
              : "servicios activos"}
          </p>
        </div>

        <button
          type="button"
          onClick={
            openCreate
          }
          className="
            inline-flex
            min-h-[48px]
            items-center
            justify-center
            rounded-full
            bg-brand-wine
            px-6
            text-sm
            font-semibold
            text-brand-cream
            transition
            hover:bg-brand-brown
          "
        >
          + Nuevo servicio
        </button>
      </div>

      {pageError && (
        <div
          className="
            mb-6
            rounded-2xl
            bg-[#F7E8E8]
            px-4
            py-3
            text-sm
            text-[#8A3535]
          "
        >
          {pageError}
        </div>
      )}

      {pageSuccess && (
        <div
          className="
            mb-6
            rounded-2xl
            bg-[#E8F2EC]
            px-4
            py-3
            text-sm
            text-[#295C3B]
          "
        >
          {pageSuccess}
        </div>
      )}

      {/* ACTIVOS */}

      <div className="space-y-4">
        {activeServices.map(
          (service) => (
            <ServiceCard
              key={
                service.id
              }
              service={
                service
              }
              onEdit={() =>
                openEdit(
                  service,
                )
              }
              actions={
                <button
                  type="button"
                  onClick={() =>
                    changeArchivedState(
                      service,
                      "archive",
                    )
                  }
                  className="
                    min-h-[44px]
                    rounded-full
                    border
                    border-brand-brown/15
                    px-5
                    text-xs
                    font-semibold
                    text-brand-brown
                    transition
                    hover:bg-brand-brown/5
                  "
                >
                  Archivar
                </button>
              }
            />
          ),
        )}

        {activeServices.length ===
          0 && (
          <div
            className="
              rounded-[1.75rem]
              border
              border-dashed
              border-brand-taupe/25
              px-6
              py-12
              text-center
            "
          >
            <p className="text-sm text-brand-brown/45">
              No hay servicios activos.
            </p>
          </div>
        )}
      </div>

      {/* ARCHIVADOS */}

      {archivedServices.length >
        0 && (
        <section className="mt-12">
          <div>
            <p
              className="
                text-xs
                font-semibold
                uppercase
                tracking-[0.2em]
                text-brand-wine
              "
            >
              Archivo
            </p>

            <h2
              className="
                mt-2
                font-display
                text-3xl
                font-semibold
                text-brand-brown
              "
            >
              Servicios archivados
            </h2>

            <p
              className="
                mt-2
                text-sm
                text-brand-brown/45
              "
            >
              Se conservan para proteger
              reservas e historial.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            {archivedServices.map(
              (service) => (
                <ServiceCard
                  key={
                    service.id
                  }
                  service={
                    service
                  }
                  archived
                  onEdit={() =>
                    openEdit(
                      service,
                    )
                  }
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          changeArchivedState(
                            service,
                            "restore",
                          )
                        }
                        className="
                          min-h-[44px]
                          rounded-full
                          bg-brand-brown
                          px-5
                          text-xs
                          font-semibold
                          text-brand-cream
                          transition
                          hover:bg-brand-wine
                        "
                      >
                        Restaurar
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          deleteService(
                            service,
                          )
                        }
                        className="
                          min-h-[44px]
                          rounded-full
                          border
                          border-[#8A3535]/20
                          px-5
                          text-xs
                          font-semibold
                          text-[#8A3535]
                          transition
                          hover:bg-[#F7E8E8]
                        "
                      >
                        Eliminar definitivamente
                      </button>
                    </>
                  }
                />
              ),
            )}
          </div>
        </section>
      )}

      {/* MODAL */}

      {mode &&
        form && (
          <div
            className="
              fixed
              inset-0
              z-[120]
              overflow-y-auto
              bg-black/40
              px-4
              py-8
              sm:px-6
            "
            onMouseDown={(
              event,
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeEditor();
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="
                mx-auto
                w-full
                max-w-[760px]
                rounded-[2rem]
                bg-[#f7f5f1]
                p-6
                shadow-2xl
                sm:p-8
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
                      tracking-[0.2em]
                      text-brand-wine
                    "
                  >
                    {mode ===
                    "create"
                      ? "Nuevo servicio"
                      : "Servicio"}
                  </p>

                  <h2
                    className="
                      mt-2
                      font-display
                      text-4xl
                      font-semibold
                      text-brand-brown
                    "
                  >
                    {mode ===
                    "create"
                      ? "Crear servicio"
                      : "Editar servicio"}
                  </h2>
                </div>

                <button
                  type="button"
                  disabled={
                    saving
                  }
                  onClick={
                    closeEditor
                  }
                  className="
                    flex
                    h-10
                    w-10
                    items-center
                    justify-center
                    rounded-full
                    border
                    border-brand-brown/15
                    text-xl
                    text-brand-brown
                  "
                >
                  ×
                </button>
              </div>

              <div
                className="
                  mt-8
                  grid
                  gap-5
                  sm:grid-cols-2
                "
              >
                <Field
                  label="Nombre"
                  className="sm:col-span-2"
                >
                  <input
                    value={
                      form.name
                    }
                    maxLength={120}
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "name",
                        event.target
                          .value,
                      )
                    }
                    className={
                      inputClass
                    }
                  />
                </Field>

                <Field label="Tipo">
                  {mode ===
                  "create" ? (
                    <select
                      value={
                        form.serviceType
                      }
                      onChange={(
                        event,
                      ) =>
                        changeServiceType(
                          event.target
                            .value as AdminService["service_type"],
                        )
                      }
                      className={
                        inputClass
                      }
                    >
                      <option value="single">
                        Sesión individual
                      </option>

                      <option value="package">
                        Proceso / paquete
                      </option>

                      <option value="group">
                        Grupal
                      </option>
                    </select>
                  ) : (
                    <input
                      disabled
                      value={getTypeLabel(
                        form.serviceType,
                      )}
                      className={`${inputClass} opacity-60`}
                    />
                  )}
                </Field>

                <Field
                  label="Orden"
                >
                  <input
                    type="number"
                    min={0}
                    value={
                      form.displayOrder
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "displayOrder",
                        event.target
                          .value,
                      )
                    }
                    className={
                      inputClass
                    }
                  />
                </Field>

                {mode ===
                  "edit" &&
                  editing && (
                  <Field
                    label="Slug"
                    className="sm:col-span-2"
                  >
                    <input
                      disabled
                      value={
                        editing.slug
                      }
                      className={`${inputClass} opacity-60`}
                    />
                  </Field>
                )}

                <Field
                  label="Descripción corta"
                  className="sm:col-span-2"
                >
                  <textarea
                    rows={3}
                    maxLength={600}
                    value={
                      form.shortDescription
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "shortDescription",
                        event.target
                          .value,
                      )
                    }
                    className={`${inputClass} resize-y py-3`}
                  />
                </Field>

                <Field
                  label="Descripción ampliada"
                  hint="Opcional"
                  className="sm:col-span-2"
                >
                  <textarea
                    rows={5}
                    maxLength={5000}
                    value={
                      form.description
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "description",
                        event.target
                          .value,
                      )
                    }
                    className={`${inputClass} resize-y py-3`}
                  />
                </Field>
              </div>

              <div
                className="
                  mt-8
                  border-t
                  border-brand-taupe/15
                  pt-7
                "
              >
                <h3
                  className="
                    font-display
                    text-2xl
                    font-semibold
                    text-brand-brown
                  "
                >
                  Precio y sesiones
                </h3>

                <div
                  className="
                    mt-5
                    grid
                    gap-5
                    sm:grid-cols-2
                  "
                >
                  <Field label="Precio">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={
                        form.requiresQuote
                      }
                      value={
                        form.price
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "price",
                          event.target
                            .value,
                        )
                      }
                      className={`${inputClass} disabled:opacity-45`}
                    />
                  </Field>

                  <Field label="Moneda">
                    <input
                      value={
                        form.currency
                      }
                      maxLength={3}
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "currency",
                          event.target.value.toUpperCase(),
                        )
                      }
                      className={
                        inputClass
                      }
                    />
                  </Field>

                  <Field
                    label="Duración"
                    hint="minutos"
                  >
                    <input
                      type="number"
                      min={1}
                      value={
                        form.durationMinutes
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "durationMinutes",
                          event.target
                            .value,
                        )
                      }
                      className={
                        inputClass
                      }
                    />
                  </Field>

                  <Field
                    label="Sesiones"
                  >
                    <input
                      type="number"
                      min={1}
                      disabled={
                        form.serviceType ===
                        "single"
                      }
                      value={
                        form.serviceType ===
                        "single"
                          ? "1"
                          : form.sessionCount
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "sessionCount",
                          event.target
                            .value,
                        )
                      }
                      className={`${inputClass} disabled:opacity-50`}
                    />
                  </Field>
                </div>
              </div>

              <div
                className="
                  mt-8
                  border-t
                  border-brand-taupe/15
                  pt-7
                "
              >
                <h3
                  className="
                    font-display
                    text-2xl
                    font-semibold
                    text-brand-brown
                  "
                >
                  Publicación
                </h3>

                <div className="mt-5 space-y-3">
                  <ToggleRow
                    label="Servicio activo"
                    description="El servicio puede mostrarse a los clientes."
                    checked={
                      form.active
                    }
                    onChange={(
                      value,
                    ) =>
                      updateForm(
                        "active",
                        value,
                      )
                    }
                  />

                  <ToggleRow
                    label="Reservable desde la web"
                    description="Permite elegir fecha y horario."
                    checked={
                      form.bookingEnabled
                    }
                    disabled={
                      form.requiresQuote
                    }
                    onChange={(
                      value,
                    ) =>
                      updateForm(
                        "bookingEnabled",
                        value,
                      )
                    }
                  />

                  <ToggleRow
                    label="Requiere cotización"
                    description="El cliente debe contactar antes de reservar."
                    checked={
                      form.requiresQuote
                    }
                    onChange={
                      toggleQuote
                    }
                  />
                </div>
              </div>

              {form.serviceType ===
                "package" && (
                <div
                  className="
                    mt-6
                    rounded-2xl
                    bg-[#F7F0DC]
                    p-4
                    text-xs
                    leading-5
                    text-[#80671C]
                  "
                >
                  Actualmente un proceso
                  de varias sesiones
                  reserva únicamente la
                  primera cita. Más
                  adelante modelaremos las
                  sesiones restantes por
                  separado.
                </div>
              )}

              {error && (
                <div
                  className="
                    mt-6
                    rounded-2xl
                    bg-[#F7E8E8]
                    px-4
                    py-3
                    text-sm
                    text-[#8A3535]
                  "
                >
                  {error}
                </div>
              )}

              {success && (
                <div
                  className="
                    mt-6
                    rounded-2xl
                    bg-[#E8F2EC]
                    px-4
                    py-3
                    text-sm
                    text-[#295C3B]
                  "
                >
                  {success}
                </div>
              )}

              <div
                className="
                  mt-8
                  flex
                  flex-col-reverse
                  gap-3
                  sm:flex-row
                  sm:justify-end
                "
              >
                <button
                  type="button"
                  disabled={
                    saving
                  }
                  onClick={
                    closeEditor
                  }
                  className="
                    min-h-[48px]
                    rounded-full
                    border
                    border-brand-brown/15
                    px-6
                    text-sm
                    font-semibold
                    text-brand-brown
                  "
                >
                  Cerrar
                </button>

                <button
                  type="button"
                  disabled={
                    saving
                  }
                  onClick={
                    saveService
                  }
                  className="
                    min-h-[48px]
                    rounded-full
                    bg-brand-wine
                    px-7
                    text-sm
                    font-semibold
                    text-brand-cream
                    transition
                    hover:bg-brand-brown
                    disabled:opacity-50
                  "
                >
                  {saving
                    ? "Guardando..."
                    : mode ===
                        "create"
                      ? "Crear servicio"
                      : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  );
}

/* =========================================================
   SERVICE CARD
========================================================= */

function ServiceCard({
  service,
  archived = false,
  onEdit,
  actions,
}: {
  service:
    AdminService;

  archived?: boolean;

  onEdit: () => void;

  actions:
    ReactNode;
}) {
  return (
    <article
      className={`
        rounded-[1.75rem]
        border
        border-brand-taupe/20
        bg-white/65
        p-6
        sm:p-7
        ${
          archived
            ? "opacity-75"
            : ""
        }
      `}
    >
      <div
        className="
          flex
          flex-col
          gap-6
          lg:flex-row
          lg:items-center
          lg:justify-between
        "
      >
        <div className="min-w-0 flex-1">
          <div
            className="
              flex
              flex-wrap
              items-center
              gap-2
            "
          >
            <span
              className={`
                rounded-full
                px-3
                py-1
                text-[10px]
                font-semibold
                uppercase
                tracking-[0.12em]
                ${
                  archived
                    ? "bg-brand-brown/8 text-brand-brown/45"
                    : "bg-[#E8F2EC] text-[#295C3B]"
                }
              `}
            >
              {archived
                ? "Archivado"
                : "Activo"}
            </span>

            <span
              className="
                rounded-full
                bg-brand-cream
                px-3
                py-1
                text-[10px]
                font-semibold
                uppercase
                tracking-[0.12em]
                text-brand-brown/55
              "
            >
              {getTypeLabel(
                service.service_type,
              )}
            </span>
          </div>

          <h3
            className="
              mt-4
              font-display
              text-3xl
              font-semibold
              text-brand-brown
            "
          >
            {service.name}
          </h3>

          <p
            className="
              mt-2
              max-w-2xl
              text-sm
              leading-6
              text-brand-brown/50
            "
          >
            {
              service.short_description
            }
          </p>

          <div
            className="
              mt-5
              flex
              flex-wrap
              gap-x-6
              gap-y-2
              text-sm
            "
          >
            <span
              className="
                font-semibold
                text-brand-wine
              "
            >
              {formatPrice(
                service,
              )}
            </span>

            {service.duration_minutes !==
              null && (
              <span className="text-brand-brown/50">
                {
                  service.duration_minutes
                }{" "}
                min
              </span>
            )}

            {service.session_count !==
              null && (
              <span className="text-brand-brown/50">
                {
                  service.session_count
                }{" "}
                {service.session_count ===
                1
                  ? "sesión"
                  : "sesiones"}
              </span>
            )}
          </div>
        </div>

        <div
          className="
            flex
            flex-wrap
            gap-2
            lg:justify-end
          "
        >
          <button
            type="button"
            onClick={
              onEdit
            }
            className="
              min-h-[44px]
              rounded-full
              border
              border-brand-wine/20
              px-5
              text-xs
              font-semibold
              text-brand-wine
              transition
              hover:bg-brand-wine
              hover:text-brand-cream
            "
          >
            Editar
          </button>

          {actions}
        </div>
      </div>
    </article>
  );
}

/* =========================================================
   UI
========================================================= */

const inputClass = `
  min-h-[48px]
  w-full
  rounded-xl
  border
  border-brand-taupe/25
  bg-white
  px-4
  text-sm
  text-brand-brown
  outline-none
  transition
  focus:border-brand-wine/45
`;

function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={
        className
      }
    >
      <div
        className="
          flex
          items-center
          justify-between
          gap-3
        "
      >
        <label
          className="
            text-sm
            font-semibold
            text-brand-brown
          "
        >
          {label}
        </label>

        {hint && (
          <span
            className="
              text-xs
              text-brand-brown/35
            "
          >
            {hint}
          </span>
        )}
      </div>

      <div className="mt-2">
        {children}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;

  onChange:
    (
      value:
        boolean,
    ) => void;
}) {
  return (
    <div
      className={`
        flex
        items-center
        justify-between
        gap-6
        rounded-2xl
        border
        border-brand-taupe/15
        bg-white/55
        p-4
        ${
          disabled
            ? "opacity-45"
            : ""
        }
      `}
    >
      <div>
        <p
          className="
            text-sm
            font-semibold
            text-brand-brown
          "
        >
          {label}
        </p>

        <p
          className="
            mt-1
            text-xs
            leading-5
            text-brand-brown/45
          "
        >
          {description}
        </p>
      </div>

      <button
        type="button"
        disabled={
          disabled
        }
        onClick={() =>
          onChange(
            !checked,
          )
        }
        aria-pressed={
          checked
        }
        className={`
          relative
          h-7
          w-12
          shrink-0
          rounded-full
          transition
          ${
            checked
              ? "bg-brand-wine"
              : "bg-brand-brown/15"
          }
        `}
      >
        <span
          className={`
            absolute
            top-1
            h-5
            w-5
            rounded-full
            bg-white
            shadow-sm
            transition
            ${
              checked
                ? "left-6"
                : "left-1"
            }
          `}
        />
      </button>
    </div>
  );
}
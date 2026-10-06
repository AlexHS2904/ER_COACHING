"use client";

import {
  type ChangeEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  createClient,
} from "@/lib/supabase/client";

export type AdminResource = {
  id: string;

  title: string;

  description:
    | string
    | null;

  category:
    string;

  resource_type:
    | "file"
    | "link";

  external_url:
    | string
    | null;

  storage_path:
    | string
    | null;

  original_filename:
    | string
    | null;

  mime_type:
    | string
    | null;

  file_size:
    | number
    | null;

  cover_storage_path:
    | string
    | null;

  cover_original_filename:
    | string
    | null;

  cover_mime_type:
    | string
    | null;

  visibility:
    | "public"
    | "private";

  active:
    boolean;

  display_order:
    number;

  created_at:
    string;

  updated_at:
    string;
};

type ResourceForm = {
  title: string;

  description:
    string;

  category:
    string;

  resourceType:
    | "file"
    | "link";

  externalUrl:
    string;

  visibility:
    | "public"
    | "private";

  active:
    boolean;

  displayOrder:
    string;
};

type EditorMode =
  | "create"
  | "edit"
  | null;

type Props = {
  initialResources:
    AdminResource[];
};

type UploadResult = {
  path: string;
  filename: string;
  mimeType: string;
  size: number;
};

/* =========================================================
   HELPERS
========================================================= */

function formatBytes(
  bytes:
    number | null,
) {
  if (
    bytes === null
  ) {
    return "";
  }

  if (
    bytes <
    1024
  ) {
    return `${bytes} B`;
  }

  if (
    bytes <
    1024 * 1024
  ) {
    return `${(
      bytes /
      1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function getTypeLabel(
  resource:
    AdminResource,
) {
  if (
    resource.resource_type ===
    "link"
  ) {
    return "Enlace";
  }

  const mime =
    resource.mime_type ??
    "";

  if (
    mime.includes(
      "pdf",
    )
  ) {
    return "PDF";
  }

  if (
    mime.includes(
      "word",
    )
  ) {
    return "Documento";
  }

  if (
    mime.includes(
      "presentation",
    )
  ) {
    return "Presentación";
  }

  if (
    mime.startsWith(
      "image/",
    )
  ) {
    return "Imagen";
  }

  return "Archivo";
}

function createForm(
  resource:
    AdminResource,
): ResourceForm {
  return {
    title:
      resource.title,

    description:
      resource.description ??
      "",

    category:
      resource.category,

    resourceType:
      resource.resource_type,

    externalUrl:
      resource.external_url ??
      "",

    visibility:
      resource.visibility,

    active:
      resource.active,

    displayOrder:
      String(
        resource.display_order,
      ),
  };
}

function createNewForm(
  order:
    number,
): ResourceForm {
  return {
    title: "",

    description:
      "",

    category:
      "Guías",

    resourceType:
      "file",

    externalUrl:
      "",

    visibility:
      "public",

    active:
      true,

    displayOrder:
      String(order),
  };
}

/* =========================================================
   COMPONENT
========================================================= */

export default function ResourcesManager({
  initialResources,
}: Props) {
  const router =
    useRouter();

  const [
    resources,
    setResources,
  ] =
    useState(
      initialResources,
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
      AdminResource | null
    >(null);

  const [
    form,
    setForm,
  ] =
    useState<
      ResourceForm | null
    >(null);

  const [
    resourceFile,
    setResourceFile,
  ] =
    useState<
      File | null
    >(null);

  const [
    coverFile,
    setCoverFile,
  ] =
    useState<
      File | null
    >(null);

  const [
    coverPreview,
    setCoverPreview,
  ] =
    useState<
      string | null
    >(null);

  const [
    removeCover,
    setRemoveCover,
  ] =
    useState(false);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    busyId,
    setBusyId,
  ] =
    useState<
      string | null
    >(null);

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

  const sortedResources =
    useMemo(
      () =>
        [...resources].sort(
          (
            a,
            b,
          ) =>
            a.display_order -
            b.display_order,
        ),
      [resources],
    );

  /* =======================================================
     EDITOR
  ======================================================= */

  function resetFiles() {
    if (
      coverPreview?.startsWith(
        "blob:",
      )
    ) {
      URL.revokeObjectURL(
        coverPreview,
      );
    }

    setResourceFile(
      null,
    );

    setCoverFile(
      null,
    );

    setCoverPreview(
      null,
    );

    setRemoveCover(
      false,
    );
  }

  function openCreate() {
    const highest =
      resources.reduce(
        (
          current,
          resource,
        ) =>
          Math.max(
            current,
            resource.display_order,
          ),
        0,
      );

    resetFiles();

    setMode(
      "create",
    );

    setEditing(
      null,
    );

    setForm(
      createNewForm(
        highest + 1,
      ),
    );

    setError("");
    setSuccess("");
  }

  function openEdit(
    resource:
      AdminResource,
  ) {
    resetFiles();

    setMode(
      "edit",
    );

    setEditing(
      resource,
    );

    setForm(
      createForm(
        resource,
      ),
    );

    if (
      resource.cover_storage_path
    ) {
      setCoverPreview(
        `/api/admin/resources/${resource.id}/cover`,
      );
    }

    setError("");
    setSuccess("");
  }

  function closeEditor() {
    if (saving) {
      return;
    }

    resetFiles();

    setMode(null);

    setEditing(
      null,
    );

    setForm(null);

    setError("");
    setSuccess("");
  }

  function updateForm<
    K extends keyof ResourceForm,
  >(
    key: K,
    value:
      ResourceForm[K],
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

  /* =======================================================
     ARCHIVOS
  ======================================================= */

  function handleCover(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target.files?.[0] ??
      null;

    if (!file) {
      return;
    }

    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
      ].includes(
        file.type,
      )
    ) {
      setError(
        "La portada debe ser JPG, PNG o WebP.",
      );

      return;
    }

    if (
      file.size >
      5 * 1024 * 1024
    ) {
      setError(
        "La portada no puede superar 5 MB.",
      );

      return;
    }

    if (
      coverPreview?.startsWith(
        "blob:",
      )
    ) {
      URL.revokeObjectURL(
        coverPreview,
      );
    }

    setCoverFile(
      file,
    );

    setCoverPreview(
      URL.createObjectURL(
        file,
      ),
    );

    setRemoveCover(
      false,
    );

    setError("");
  }

  function removeCurrentCover() {
    if (
      coverPreview?.startsWith(
        "blob:",
      )
    ) {
      URL.revokeObjectURL(
        coverPreview,
      );
    }

    setCoverFile(
      null,
    );

    setCoverPreview(
      null,
    );

    setRemoveCover(
      true,
    );
  }

  async function uploadFile(
    file: File,
    kind:
      | "resource"
      | "cover",
  ): Promise<UploadResult> {
    const prepare =
      await fetch(
        "/api/admin/resources/upload-url",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              kind,

              filename:
                file.name,

              mimeType:
                file.type,

              size:
                file.size,
            }),
        },
      );

    const prepared =
      await prepare.json();

    if (
      !prepare.ok ||
      !prepared?.path ||
      !prepared?.token
    ) {
      throw new Error(
        prepared?.error ||
          "No fue posible preparar la subida.",
      );
    }

    const supabase =
      createClient();

    const {
      error:
        uploadError,
    } = await supabase.storage
      .from("resources")
      .uploadToSignedUrl(
        prepared.path,
        prepared.token,
        file,
        {
          contentType:
            file.type,
        },
      );

    if (uploadError) {
      throw new Error(
        "No fue posible subir el archivo.",
      );
    }

    return {
      path:
        prepared.path,

      filename:
        file.name,

      mimeType:
        file.type,

      size:
        file.size,
    };
  }

  /* =======================================================
     GUARDAR
  ======================================================= */

  async function saveResource() {
    if (
      !form ||
      !mode ||
      saving
    ) {
      return;
    }

    setError("");
    setSuccess("");

    if (
      form.title.trim().length <
      2
    ) {
      setError(
        "Ingresa un título.",
      );

      return;
    }

    if (
      form.category.trim().length <
      2
    ) {
      setError(
        "Ingresa una categoría.",
      );

      return;
    }

    if (
      form.resourceType ===
        "link" &&
      !form.externalUrl.trim()
    ) {
      setError(
        "Ingresa el enlace del recurso.",
      );

      return;
    }

    if (
      form.resourceType ===
        "file" &&
      mode === "create" &&
      !resourceFile
    ) {
      setError(
        "Selecciona el archivo del recurso.",
      );

      return;
    }

    if (
      form.resourceType ===
        "file" &&
      mode === "edit" &&
      !resourceFile &&
      editing?.resource_type !==
        "file"
    ) {
      setError(
        "Selecciona el archivo del recurso.",
      );

      return;
    }

    setSaving(
      true,
    );

    try {
      let uploadedResource:
        | UploadResult
        | null = null;

      let uploadedCover:
        | UploadResult
        | null = null;

      if (
        form.resourceType ===
          "file" &&
        resourceFile
      ) {
        uploadedResource =
          await uploadFile(
            resourceFile,
            "resource",
          );
      }

      if (coverFile) {
        uploadedCover =
          await uploadFile(
            coverFile,
            "cover",
          );
      }

      const payload = {
        title:
          form.title,

        description:
          form.description,

        category:
          form.category,

        resourceType:
          form.resourceType,

        externalUrl:
          form.resourceType ===
          "link"
            ? form.externalUrl
            : null,

        visibility:
          form.visibility,

        active:
          form.active,

        displayOrder:
          Number(
            form.displayOrder,
          ),

        storagePath:
          uploadedResource?.path ??
          null,

        originalFilename:
          uploadedResource?.filename ??
          null,

        mimeType:
          uploadedResource?.mimeType ??
          null,

        fileSize:
          uploadedResource?.size ??
          null,

        coverStoragePath:
          uploadedCover?.path ??
          null,

        coverOriginalFilename:
          uploadedCover?.filename ??
          null,

        coverMimeType:
          uploadedCover?.mimeType ??
          null,

        removeCover,
      };

      const endpoint =
        mode === "create"
          ? "/api/admin/resources"
          : `/api/admin/resources/${editing!.id}`;

      const response =
        await fetch(
          endpoint,
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
                payload,
              ),
          },
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data?.resource
      ) {
        throw new Error(
          data?.error ||
            "No fue posible guardar el recurso.",
        );
      }

      const saved =
        data.resource as
          AdminResource;

      setResources(
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
            (resource) =>
              resource.id ===
              saved.id
                ? saved
                : resource,
          );
        },
      );

      resetFiles();

      setEditing(
        saved,
      );

      setForm(
        createForm(
          saved,
        ),
      );

      setMode(
        "edit",
      );

      if (
        saved.cover_storage_path
      ) {
        setCoverPreview(
          `/api/admin/resources/${saved.id}/cover?t=${Date.now()}`,
        );
      }

      setSuccess(
        mode === "create"
          ? "Recurso creado correctamente."
          : "Recurso actualizado correctamente.",
      );

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No fue posible guardar el recurso.",
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  /* =======================================================
     MOSTRAR / OCULTAR
  ======================================================= */

  async function toggleResource(
    resource:
      AdminResource,
  ) {
    setPageError("");
    setPageSuccess("");

    setBusyId(
      resource.id,
    );

    try {
      const response =
        await fetch(
          `/api/admin/resources/${resource.id}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                active:
                  !resource.active,
              }),
          },
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data?.resource
      ) {
        throw new Error(
          data?.error ||
            "No fue posible actualizar el recurso.",
        );
      }

      const updated =
        data.resource as
          AdminResource;

      setResources(
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
        updated.active
          ? "Recurso publicado."
          : "Recurso ocultado.",
      );

      router.refresh();
    } catch (err) {
      setPageError(
        err instanceof Error
          ? err.message
          : "No fue posible actualizar el recurso.",
      );
    } finally {
      setBusyId(
        null,
      );
    }
  }

  /* =======================================================
     ELIMINAR
  ======================================================= */

  async function deleteResource(
    resource:
      AdminResource,
  ) {
    const confirmed =
      window.confirm(
        `¿Eliminar "${resource.title}"?\n\nSe eliminará también su archivo y portada de Storage. Esta acción no se puede deshacer.`,
      );

    if (!confirmed) {
      return;
    }

    setPageError("");
    setPageSuccess("");

    setBusyId(
      resource.id,
    );

    try {
      const response =
        await fetch(
          `/api/admin/resources/${resource.id}`,
          {
            method:
              "DELETE",
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No fue posible eliminar el recurso.",
        );
      }

      setResources(
        (current) =>
          current.filter(
            (item) =>
              item.id !==
              resource.id,
          ),
      );

      setPageSuccess(
        "Recurso eliminado.",
      );

      router.refresh();
    } catch (err) {
      setPageError(
        err instanceof Error
          ? err.message
          : "No fue posible eliminar el recurso.",
      );
    } finally {
      setBusyId(
        null,
      );
    }
  }

  return (
    <>
      {/* ==================================================
          TOP
      ================================================== */}

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
        <p
          className="
            text-sm
            text-brand-brown/45
          "
        >
          {resources.length}{" "}
          {resources.length ===
          1
            ? "recurso"
            : "recursos"}
        </p>

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
          + Nuevo recurso
        </button>
      </div>

      {pageError && (
        <Message
          type="error"
        >
          {pageError}
        </Message>
      )}

      {pageSuccess && (
        <Message
          type="success"
        >
          {pageSuccess}
        </Message>
      )}

      {/* ==================================================
          LISTA
      ================================================== */}

      {sortedResources.length >
      0 ? (
        <div className="space-y-4">
          {sortedResources.map(
            (
              resource,
            ) => (
              <ResourceCard
                key={
                  resource.id
                }
                resource={
                  resource
                }
                busy={
                  busyId ===
                  resource.id
                }
                onEdit={() =>
                  openEdit(
                    resource,
                  )
                }
                onToggle={() =>
                  toggleResource(
                    resource,
                  )
                }
                onDelete={() =>
                  deleteResource(
                    resource,
                  )
                }
              />
            ),
          )}
        </div>
      ) : (
        <div
          className="
            py-20
            text-center
          "
        >
          <p
            className="
              font-display
              text-3xl
              italic
              text-brand-brown/40
            "
          >
            Aún no hay recursos.
          </p>

          <button
            type="button"
            onClick={
              openCreate
            }
            className="
              mt-6
              text-sm
              font-semibold
              text-brand-wine
              underline
              underline-offset-4
            "
          >
            Crear el primero
          </button>
        </div>
      )}

      {/* ==================================================
          MODAL
      ================================================== */}

      {mode &&
        form && (
          <div
            className="
              fixed
              inset-0
              z-[120]
              overflow-y-auto
              bg-black/45
              px-4
              py-8
            "
            onMouseDown={(
              event,
            ) => {
              if (
                event.target ===
                  event.currentTarget &&
                !saving
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
                max-w-[820px]
                rounded-[2rem]
                bg-[#f7f5f1]
                p-6
                shadow-2xl
                sm:p-8
              "
            >
              {/* HEADER */}

              <div
                className="
                  flex
                  items-start
                  justify-between
                  gap-6
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
                    Recursos
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
                      ? "Nuevo recurso"
                      : "Editar recurso"}
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

              {/* TIPO */}

              <div className="mt-8">
                <p
                  className="
                    text-sm
                    font-semibold
                    text-brand-brown
                  "
                >
                  Tipo de recurso
                </p>

                <div
                  className="
                    mt-3
                    grid
                    grid-cols-2
                    gap-3
                  "
                >
                  <TypeButton
                    active={
                      form.resourceType ===
                      "file"
                    }
                    onClick={() =>
                      updateForm(
                        "resourceType",
                        "file",
                      )
                    }
                  >
                    Archivo
                  </TypeButton>

                  <TypeButton
                    active={
                      form.resourceType ===
                      "link"
                    }
                    onClick={() =>
                      updateForm(
                        "resourceType",
                        "link",
                      )
                    }
                  >
                    Enlace
                  </TypeButton>
                </div>
              </div>

              {/* GENERAL */}

              <div
                className="
                  mt-7
                  grid
                  gap-5
                  sm:grid-cols-2
                "
              >
                <Field
                  label="Título"
                  className="sm:col-span-2"
                >
                  <input
                    value={
                      form.title
                    }
                    maxLength={
                      150
                    }
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "title",
                        event.target
                          .value,
                      )
                    }
                    className={
                      inputClass
                    }
                  />
                </Field>

                <Field label="Categoría">
                  <input
                    value={
                      form.category
                    }
                    maxLength={
                      80
                    }
                    placeholder="Ej. Guías"
                    onChange={(
                      event,
                    ) =>
                      updateForm(
                        "category",
                        event.target
                          .value,
                      )
                    }
                    className={
                      inputClass
                    }
                  />
                </Field>

                <Field label="Orden">
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

                <Field
                  label="Descripción"
                  className="sm:col-span-2"
                >
                  <textarea
                    rows={4}
                    maxLength={
                      1500
                    }
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

              {/* RECURSO */}

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
                  Contenido
                </h3>

                {form.resourceType ===
                "file" ? (
                  <div className="mt-5">
                    <FilePicker
                      label={
                        resourceFile
                          ? resourceFile.name
                          : editing?.resource_type ===
                                "file" &&
                              editing.original_filename
                            ? `Actual: ${editing.original_filename}`
                            : "Seleccionar archivo"
                      }
                      accept=".pdf,.epub,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
                      onChange={(
                        event,
                      ) => {
                        const file =
                          event.target.files?.[0] ??
                          null;

                        setResourceFile(
                          file,
                        );
                      }}
                    />

                    <p
                      className="
                        mt-2
                        text-xs
                        text-brand-brown/40
                      "
                    >
                      Máximo 20 MB.
                      PDF, EPUB,
                      documentos,
                      presentaciones,
                      hojas de cálculo,
                      texto o imágenes.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5">
                    <Field label="Enlace">
                      <input
                        type="url"
                        value={
                          form.externalUrl
                        }
                        placeholder="https://..."
                        onChange={(
                          event,
                        ) =>
                          updateForm(
                            "externalUrl",
                            event.target
                              .value,
                          )
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>
                  </div>
                )}
              </div>

              {/* PORTADA */}

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
                  Portada
                </h3>

                <p
                  className="
                    mt-1
                    text-sm
                    text-brand-brown/45
                  "
                >
                  Esta será la imagen
                  grande que aparece en
                  la card pública.
                </p>

                <div
                  className="
                    mt-5
                    grid
                    gap-5
                    sm:grid-cols-[1fr_0.9fr]
                  "
                >
                  <div>
                    <FilePicker
                      label={
                        coverFile
                          ? coverFile.name
                          : "Seleccionar portada"
                      }
                      accept="image/jpeg,image/png,image/webp"
                      onChange={
                        handleCover
                      }
                    />

                    <p
                      className="
                        mt-2
                        text-xs
                        text-brand-brown/40
                      "
                    >
                      Recomendado:
                      horizontal 16:10.
                      JPG, PNG o WebP.
                      Máximo 5 MB.
                    </p>
                  </div>

                  <div
                    className="
                      aspect-[16/10]
                      overflow-hidden
                      rounded-2xl
                      bg-brand-brown/5
                    "
                  >
                    {coverPreview ? (
                      <img
                        src={
                          coverPreview
                        }
                        alt=""
                        className="
                          h-full
                          w-full
                          object-cover
                        "
                      />
                    ) : (
                      <div
                        className="
                          flex
                          h-full
                          items-center
                          justify-center
                          px-5
                          text-center
                          text-xs
                          text-brand-brown/35
                        "
                      >
                        Vista previa
                        de portada
                      </div>
                    )}
                  </div>
                </div>

                {coverPreview && (
                  <button
                    type="button"
                    onClick={
                      removeCurrentCover
                    }
                    className="
                      mt-3
                      text-xs
                      font-semibold
                      text-[#8A3535]
                      underline
                      underline-offset-4
                    "
                  >
                    Quitar portada
                  </button>
                )}
              </div>

              {/* PUBLICACIÓN */}

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

                <div
                  className="
                    mt-5
                    grid
                    gap-5
                    sm:grid-cols-2
                  "
                >
                  <Field label="Visibilidad">
                    <select
                      value={
                        form.visibility
                      }
                      onChange={(
                        event,
                      ) =>
                        updateForm(
                          "visibility",
                          event.target
                            .value as
                            | "public"
                            | "private",
                        )
                      }
                      className={
                        inputClass
                      }
                    >
                      <option value="public">
                        Público
                      </option>

                      <option value="private">
                        Privado
                      </option>
                    </select>
                  </Field>

                  <div>
                    <p
                      className="
                        text-sm
                        font-semibold
                        text-brand-brown
                      "
                    >
                      Estado
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        updateForm(
                          "active",
                          !form.active,
                        )
                      }
                      className={`
                        mt-2
                        flex
                        min-h-[48px]
                        w-full
                        items-center
                        justify-between
                        rounded-xl
                        border
                        px-4
                        text-sm
                        font-semibold
                        ${
                          form.active
                            ? "border-[#295C3B]/20 bg-[#E8F2EC] text-[#295C3B]"
                            : "border-brand-brown/10 bg-white text-brand-brown/45"
                        }
                      `}
                    >
                      <span>
                        {form.active
                          ? "Visible"
                          : "Oculto"}
                      </span>

                      <span>
                        {form.active
                          ? "●"
                          : "○"}
                      </span>
                    </button>
                  </div>
                </div>

                {form.visibility ===
                  "private" && (
                  <div
                    className="
                      mt-4
                      rounded-2xl
                      bg-[#F7F0DC]
                      p-4
                      text-xs
                      leading-5
                      text-[#80671C]
                    "
                  >
                    Los recursos privados
                    no aparecen en la
                    página pública. Más
                    adelante podremos
                    asignarlos a clientes
                    específicos.
                  </div>
                )}
              </div>

              {/* MENSAJES */}

              {error && (
                <div className="mt-6">
                  <Message type="error">
                    {error}
                  </Message>
                </div>
              )}

              {success && (
                <div className="mt-6">
                  <Message type="success">
                    {success}
                  </Message>
                </div>
              )}

              {/* ACTIONS */}

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
                    disabled:opacity-50
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
                    saveResource
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
                      ? "Crear recurso"
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
   CARD
========================================================= */

function ResourceCard({
  resource,
  busy,
  onEdit,
  onToggle,
  onDelete,
}: {
  resource:
    AdminResource;

  busy:
    boolean;

  onEdit:
    () => void;

  onToggle:
    () => void;

  onDelete:
    () => void;
}) {
  return (
    <article
      className="
        overflow-hidden
        rounded-[1.75rem]
        border
        border-brand-taupe/20
        bg-white/65
      "
    >
      <div
        className="
          grid
          md:grid-cols-[220px_1fr]
        "
      >
        {/* COVER */}

        <div
          className="
            aspect-[16/10]
            bg-brand-brown/5
            md:aspect-auto
            md:min-h-[185px]
          "
        >
          {resource.cover_storage_path ? (
            <img
              src={`/api/admin/resources/${resource.id}/cover`}
              alt=""
              className="
                h-full
                w-full
                object-cover
              "
            />
          ) : (
            <div
              className="
                flex
                h-full
                min-h-[180px]
                items-center
                justify-center
                bg-brand-cream
                p-5
                text-center
              "
            >
              <span
                className="
                  font-display
                  text-2xl
                  italic
                  text-brand-wine/45
                "
              >
                {resource.category}
              </span>
            </div>
          )}
        </div>

        {/* CONTENT */}

        <div
          className="
            flex
            flex-col
            justify-between
            gap-6
            p-6
          "
        >
          <div>
            <div
              className="
                flex
                flex-wrap
                gap-2
              "
            >
              <Badge
                className={
                  resource.active
                    ? "bg-[#E8F2EC] text-[#295C3B]"
                    : "bg-brand-brown/8 text-brand-brown/45"
                }
              >
                {resource.active
                  ? "Visible"
                  : "Oculto"}
              </Badge>

              <Badge
                className={
                  resource.visibility ===
                  "public"
                    ? "bg-brand-wine/8 text-brand-wine"
                    : "bg-[#F7F0DC] text-[#80671C]"
                }
              >
                {resource.visibility ===
                "public"
                  ? "Público"
                  : "Privado"}
              </Badge>

              <Badge className="bg-brand-cream text-brand-brown/60">
                {getTypeLabel(
                  resource,
                )}
              </Badge>
            </div>

            <h2
              className="
                mt-4
                font-display
                text-3xl
                font-semibold
                text-brand-brown
              "
            >
              {resource.title}
            </h2>

            <p
              className="
                mt-1
                text-xs
                font-semibold
                uppercase
                tracking-[0.16em]
                text-brand-wine
              "
            >
              {resource.category}
            </p>

            {resource.description && (
              <p
                className="
                  mt-3
                  line-clamp-2
                  max-w-2xl
                  text-sm
                  leading-6
                  text-brand-brown/50
                "
              >
                {resource.description}
              </p>
            )}

            {resource.resource_type ===
                "file" &&
              resource.file_size !==
                null && (
                <p
                  className="
                    mt-3
                    text-xs
                    text-brand-brown/35
                  "
                >
                  {resource.original_filename}{" "}
                  ·{" "}
                  {formatBytes(
                    resource.file_size,
                  )}
                </p>
              )}
          </div>

          <div
            className="
              flex
              flex-wrap
              gap-2
            "
          >
            <button
              type="button"
              disabled={
                busy
              }
              onClick={
                onEdit
              }
              className="
                min-h-[42px]
                rounded-full
                border
                border-brand-wine/20
                px-5
                text-xs
                font-semibold
                text-brand-wine
              "
            >
              Editar
            </button>

            <button
              type="button"
              disabled={
                busy
              }
              onClick={
                onToggle
              }
              className="
                min-h-[42px]
                rounded-full
                border
                border-brand-brown/15
                px-5
                text-xs
                font-semibold
                text-brand-brown
              "
            >
              {resource.active
                ? "Ocultar"
                : "Mostrar"}
            </button>

            <button
              type="button"
              disabled={
                busy
              }
              onClick={
                onDelete
              }
              className="
                min-h-[42px]
                rounded-full
                border
                border-[#8A3535]/20
                px-5
                text-xs
                font-semibold
                text-[#8A3535]
              "
            >
              Eliminar
            </button>
          </div>
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
  className = "",
  children,
}: {
  label:
    string;

  className?:
    string;

  children:
    ReactNode;
}) {
  return (
    <div
      className={
        className
      }
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

      <div className="mt-2">
        {children}
      </div>
    </div>
  );
}

function TypeButton({
  active,
  onClick,
  children,
}: {
  active:
    boolean;

  onClick:
    () => void;

  children:
    ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`
        min-h-[52px]
        rounded-xl
        border
        text-sm
        font-semibold
        transition
        ${
          active
            ? "border-brand-wine bg-brand-wine text-brand-cream"
            : "border-brand-taupe/25 bg-white text-brand-brown"
        }
      `}
    >
      {children}
    </button>
  );
}

function FilePicker({
  label,
  accept,
  onChange,
}: {
  label:
    string;

  accept:
    string;

  onChange:
    (
      event:
        ChangeEvent<HTMLInputElement>,
    ) => void;
}) {
  return (
    <label
      className="
        flex
        min-h-[100px]
        cursor-pointer
        items-center
        justify-center
        rounded-2xl
        border
        border-dashed
        border-brand-taupe/40
        bg-white/60
        px-5
        text-center
        text-sm
        font-semibold
        text-brand-brown
        transition
        hover:border-brand-wine/40
        hover:bg-white
      "
    >
      <input
        type="file"
        accept={
          accept
        }
        onChange={
          onChange
        }
        className="hidden"
      />

      {label}
    </label>
  );
}

function Badge({
  className,
  children,
}: {
  className:
    string;

  children:
    ReactNode;
}) {
  return (
    <span
      className={`
        rounded-full
        px-3
        py-1
        text-[10px]
        font-semibold
        uppercase
        tracking-[0.12em]
        ${className}
      `}
    >
      {children}
    </span>
  );
}

function Message({
  type,
  children,
}: {
  type:
    | "error"
    | "success";

  children:
    ReactNode;
}) {
  return (
    <div
      className={`
        mb-5
        rounded-2xl
        px-4
        py-3
        text-sm
        ${
          type ===
          "error"
            ? "bg-[#F7E8E8] text-[#8A3535]"
            : "bg-[#E8F2EC] text-[#295C3B]"
        }
      `}
    >
      {children}
    </div>
  );
}
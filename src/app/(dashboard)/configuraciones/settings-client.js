"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Image, ImageUp, Loader2, Save, Trash2 } from "lucide-react";
import InstituteConnectionCard from "./institute-connection-card";

function formatFileSize(bytes = 0) {
  if (!bytes) {
    return "-";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SettingsClient({
  initialSettings,
  initialInstituteSettings,
  initialTimeZone,
  canManage,
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [timeZone, setTimeZone] = useState(
    initialTimeZone?.timeZone || "America/La_Paz",
  );
  const [isSavingTimeZone, setIsSavingTimeZone] = useState(false);
  const logo = settings.logo;
  const displayLogoUrl = previewUrl || logo?.url || "";
  const allowedTypes = useMemo(
    () =>
      settings.allowedLogoTypes?.join(",") || "image/png,image/jpeg,image/webp",
    [settings.allowedLogoTypes],
  );

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl],
  );

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setMessage("");
    setError("");

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }

    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  async function uploadSelectedLogo(event) {
    event.preventDefault();

    if (!selectedFile || !canManage) {
      return;
    }

    const formData = new FormData();
    formData.append("logo", selectedFile);
    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/pos/settings/logo", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo guardar el logo.");
      }

      setSettings(payload.settings);
      setSelectedFile(null);
      setMessage("Logo guardado.");

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl("");
      }
    } catch (saveError) {
      setError(saveError.message || "No se pudo guardar el logo.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeLogo() {
    if (!canManage || !logo) {
      return;
    }

    setIsDeleting(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/pos/settings/logo", {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo eliminar el logo.");
      }

      setSettings(payload.settings);
      setSelectedFile(null);
      setMessage("Logo eliminado.");

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl("");
      }
    } catch (deleteError) {
      setError(deleteError.message || "No se pudo eliminar el logo.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function saveTimeZone(event) {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setIsSavingTimeZone(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/pos/settings/timezone", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeZone }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message || "No se pudo guardar la zona horaria.",
        );
      }

      setTimeZone(payload.settings.timeZone);
      setMessage("Zona horaria guardada.");
    } catch (saveError) {
      setError(saveError.message || "No se pudo guardar la zona horaria.");
    } finally {
      setIsSavingTimeZone(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-6">
      <div className="border-b border-neutral-800 pb-4">
        <p className="text-xs font-medium text-neutral-500 uppercase">
          Administracion
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Configuraciones
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Gestiona la identidad visual y las integraciones del punto de venta.
        </p>
      </div>

      {!canManage ? (
        <div className="rounded-md border border-yellow-900 bg-yellow-950 px-4 py-3 text-sm text-yellow-200">
          Solo un administrador puede editar configuraciones.
        </div>
      ) : null}

      {message ? (
        <div className="rounded-md border border-emerald-900 bg-emerald-950 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="rounded-md border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs font-medium text-neutral-500 uppercase">
            Vista previa
          </p>
          <div className="mt-4 grid aspect-square place-items-center rounded-md border border-neutral-800 bg-neutral-950 p-6">
            {displayLogoUrl ? (
              <img
                src={displayLogoUrl}
                alt="Logo del POS"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="text-center text-neutral-500">
                <Image className="mx-auto size-12" />
                <p className="mt-3 text-sm">Sin logo configurado</p>
              </div>
            )}
          </div>
          {logo ? (
            <div className="mt-4 space-y-1 text-sm text-neutral-400">
              <p className="truncate">Archivo: {logo.name}</p>
              <p>Tamano: {formatFileSize(logo.size)}</p>
            </div>
          ) : null}
        </div>

        <form
          onSubmit={uploadSelectedLogo}
          className="rounded-md border border-neutral-800 bg-neutral-900 p-4"
        >
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase">
              Logo
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {logo ? "Editar logo" : "Subir logo"}
            </h2>
          </div>

          <label className="mt-5 block text-sm font-medium text-neutral-300">
            Archivo de imagen
            <input
              type="file"
              accept={allowedTypes}
              onChange={handleFileChange}
              disabled={!canManage || isSaving || isDeleting}
              className="mt-2 block w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-300 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-3 text-sm text-neutral-500">
            Formatos permitidos: PNG, JPG o WEBP. Tamano maximo:{" "}
            {formatFileSize(settings.maxLogoSize)}.
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={!canManage || !selectedFile || isSaving || isDeleting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-neutral-100 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : logo ? (
                <Save className="size-4" />
              ) : (
                <ImageUp className="size-4" />
              )}
              {logo ? "Guardar cambios" : "Subir logo"}
            </button>

            <button
              type="button"
              onClick={removeLogo}
              disabled={!canManage || !logo || isSaving || isDeleting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-neutral-800 px-4 text-sm font-semibold text-neutral-300 transition hover:border-red-500 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Eliminar logo
            </button>
          </div>
        </form>
      </div>

      <form
        onSubmit={saveTimeZone}
        className="rounded-md border border-neutral-800 bg-neutral-900 p-4"
      >
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-md bg-violet-950 text-violet-300">
            <Clock3 className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase">
              Reloj del POS
            </p>
            <h2 className="mt-1 text-lg font-semibold">Zona horaria</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Define la zona horaria que usará el reloj visible en el punto de
              venta.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm font-medium text-neutral-300">
            Zona horaria
            <select
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              disabled={!canManage || isSavingTimeZone}
              className="mt-2 block h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {(initialTimeZone?.options || []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={!canManage || isSavingTimeZone}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-neutral-100 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            {isSavingTimeZone ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar zona horaria
          </button>
        </div>
      </form>

      <InstituteConnectionCard
        initialSettings={initialInstituteSettings}
        canManage={canManage}
      />
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit3, Search, Store, Trash2, X } from "lucide-react";

const emptyForm = {
  id: "",
  name: "",
  code: "",
  address: "",
  city: "",
  phone: "",
  isActive: true,
};

function toForm(branch) {
  return {
    ...emptyForm,
    ...branch,
  };
}

export default function BranchesManagerClient({ initialBranches, canManage }) {
  const [branches, setBranches] = useState(initialBranches);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.isActive),
    [branches],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      refreshBranches(searchTerm);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  async function refreshBranches(search = "") {
    const params = new URLSearchParams({ search });
    const response = await fetch(`/api/pos/manage/branches?${params}`, {
      credentials: "same-origin",
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.message || "No se pudieron cargar sucursales.");
      return;
    }

    setBranches(payload.branches);
  }

  function resetForm() {
    setForm(emptyForm);
    setMessage("");
    setError("");
  }

  function editBranch(branch) {
    setForm(toForm(branch));
    setMessage("");
    setError("");
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveBranch(event) {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        form.id
          ? `/api/pos/manage/branches/${form.id}`
          : "/api/pos/manage/branches",
        {
          method: form.id ? "PATCH" : "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo guardar la sucursal.");
      }

      await refreshBranches(searchTerm);
      resetForm();
      setMessage("Sucursal guardada.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteBranch(branchId) {
    if (!canManage) {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/pos/manage/branches/${branchId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo desactivar.");
      }

      await refreshBranches(searchTerm);
      if (form.id === branchId) {
        resetForm();
      }
      setMessage("Sucursal desactivada.");
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-neutral-800 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase">
              Operacion
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Sucursales
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {activeBranches.length} sucursales activas
            </p>
          </div>

          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por nombre, codigo o ciudad"
              className="h-12 w-full rounded-md border border-neutral-800 bg-neutral-900 px-10 pr-11 text-sm text-neutral-100 transition outline-none placeholder:text-neutral-600 focus:border-neutral-300"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
                aria-label="Limpiar busqueda"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

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

        <div className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[minmax(220px,1fr)_100px_150px_130px_120px] border-b border-neutral-800 bg-neutral-950 px-4 py-3 text-xs font-medium text-neutral-500 uppercase">
                <span>Sucursal</span>
                <span>Codigo</span>
                <span>Ciudad</span>
                <span>Estado</span>
                <span className="text-right">Acciones</span>
              </div>

              <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
                {branches.map((branch) => (
                  <div
                    key={branch.id}
                    className="grid grid-cols-[minmax(220px,1fr)_100px_150px_130px_120px] items-center border-b border-neutral-800 px-4 py-3 text-sm last:border-b-0 hover:bg-neutral-800/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-100">
                        {branch.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-neutral-500">
                        {branch.address || "Sin direccion"}
                      </p>
                    </div>
                    <span className="font-medium text-neutral-300">
                      {branch.code}
                    </span>
                    <span className="text-neutral-300">{branch.city}</span>
                    <span
                      className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${
                        branch.isActive
                          ? "border-emerald-900 bg-emerald-950 text-emerald-200"
                          : "border-neutral-700 bg-neutral-950 text-neutral-400"
                      }`}
                    >
                      {branch.isActive ? "Activa" : "Inactiva"}
                    </span>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => editBranch(branch)}
                        className="grid size-9 place-items-center rounded-md border border-neutral-700 text-neutral-300 transition hover:border-neutral-300 hover:text-neutral-100"
                        title={canManage ? "Editar" : "Ver"}
                      >
                        <Edit3 className="size-4" />
                      </button>
                      {canManage && branch.isActive ? (
                        <button
                          type="button"
                          onClick={() => deleteBranch(branch.id)}
                          className="grid size-9 place-items-center rounded-md border border-neutral-700 text-neutral-300 transition hover:border-red-500 hover:text-red-200"
                          title="Desactivar"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {branches.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-neutral-500">
                    No hay sucursales para mostrar.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <form
        onSubmit={saveBranch}
        className="h-fit rounded-md border border-neutral-800 bg-neutral-900 p-4"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-4">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase">
              {form.id ? "Edicion" : "Nueva"}
            </p>
            <h2 className="mt-1 text-lg font-semibold">Sucursal</h2>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-neutral-300 transition hover:border-neutral-300 hover:text-neutral-100"
            >
              <Store className="size-4" />
              Nueva
            </button>
          ) : null}
        </div>

        {!canManage ? (
          <p className="mt-4 rounded-md border border-yellow-900 bg-yellow-950 px-3 py-2 text-sm text-yellow-100">
            Tu usuario solo puede consultar sucursales asignadas.
          </p>
        ) : null}

        <div className="mt-4 grid gap-3">
          <label className="text-xs font-medium text-neutral-400">
            Nombre
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              disabled={!canManage}
              className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-neutral-400">
              Codigo
              <input
                value={form.code}
                onChange={(event) => updateField("code", event.target.value)}
                disabled={!canManage}
                className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
              />
            </label>
            <label className="text-xs font-medium text-neutral-400">
              Ciudad
              <input
                value={form.city}
                onChange={(event) => updateField("city", event.target.value)}
                disabled={!canManage}
                className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
              />
            </label>
          </div>

          <label className="text-xs font-medium text-neutral-400">
            Direccion
            <input
              value={form.address}
              onChange={(event) => updateField("address", event.target.value)}
              disabled={!canManage}
              className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
            />
          </label>

          <label className="text-xs font-medium text-neutral-400">
            Telefono
            <input
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              disabled={!canManage}
              className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              checked={form.isActive}
              onChange={(event) =>
                updateField("isActive", event.target.checked)
              }
              disabled={!canManage}
              type="checkbox"
              className="size-4 accent-neutral-100"
            />
            Sucursal activa
          </label>
        </div>

        {canManage ? (
          <button
            type="submit"
            disabled={isSaving}
            className="mt-5 h-12 w-full rounded-md bg-neutral-100 text-sm font-semibold text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            {isSaving ? "Guardando..." : "Guardar sucursal"}
          </button>
        ) : null}
      </form>
    </section>
  );
}

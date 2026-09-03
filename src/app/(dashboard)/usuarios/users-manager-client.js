"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit3, Eye, EyeOff, Search, Trash2, UserPlus, X } from "lucide-react";

const emptyForm = {
  id: "",
  userId: "",
  name: "",
  email: "",
  password: "",
  role: "cashier",
  allowedBranchIds: [],
  isActive: true,
};

function toForm(user) {
  return {
    ...emptyForm,
    ...user,
    password: "",
    allowedBranchIds: user.allowedBranchIds || [],
  };
}

function roleLabel(role) {
  if (role === "super_admin") return "Super admin";
  return role === "admin" ? "Admin" : "Cajero";
}

function branchNames(user, branchById) {
  const names = (user.allowedBranchIds || [])
    .map((branchId) => branchById.get(branchId)?.name)
    .filter(Boolean);

  if (names.length === 0) {
    return "Sin sucursal";
  }

  return names.join(", ");
}

export default function UsersManagerClient({
  branches,
  initialUsers,
  currentUserId,
  canManage,
  isSuperAdmin,
  initialHasActiveSuperAdmin,
}) {
  const [users, setUsers] = useState(initialUsers);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [hasActiveSuperAdmin, setHasActiveSuperAdmin] = useState(
    initialHasActiveSuperAdmin,
  );

  const activeUsers = useMemo(
    () => users.filter((user) => user.isActive),
    [users],
  );
  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch])),
    [branches],
  );
  const isEditingSelf = form.userId === currentUserId;
  const selectedUser = users.find((user) => user.id === form.id);
  const editingProtectedSuperAdmin = Boolean(
    selectedUser?.role === "super_admin" && !isSuperAdmin,
  );
  const canEditForm = canManage && !editingProtectedSuperAdmin;
  const canAssignSuperAdmin = isSuperAdmin || !hasActiveSuperAdmin;

  useEffect(() => {
    if (!canManage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      refreshUsers(searchTerm);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchTerm, canManage]);

  async function refreshUsers(search = "") {
    const params = new URLSearchParams({ search });
    const response = await fetch(`/api/pos/manage/users?${params}`);
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.message || "No se pudieron cargar usuarios.");
      return;
    }

    setUsers(payload.users);
    setHasActiveSuperAdmin(Boolean(payload.capabilities?.hasActiveSuperAdmin));
  }

  function resetForm() {
    setForm(emptyForm);
    setShowPassword(false);
    setMessage("");
    setError("");
  }

  function editUser(user) {
    setForm(toForm(user));
    setShowPassword(false);
    setMessage("");
    setError("");
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleBranch(branchId) {
    setForm((current) => {
      const currentIds = current.allowedBranchIds || [];
      const exists = currentIds.includes(branchId);

      return {
        ...current,
        allowedBranchIds: exists
          ? currentIds.filter((id) => id !== branchId)
          : [...currentIds, branchId],
      };
    });
  }

  async function saveUser(event) {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        form.id ? `/api/pos/manage/users/${form.id}` : "/api/pos/manage/users",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo guardar el usuario.");
      }

      await refreshUsers(searchTerm);
      resetForm();
      setMessage("Usuario guardado.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteUser(profileId) {
    if (!canManage) {
      return;
    }

    const target = users.find((user) => user.id === profileId);
    if (
      !target ||
      !window.confirm(
        `¿Eliminar definitivamente a ${target.name}? Esta acción cerrará sus sesiones y no se puede deshacer.`,
      )
    ) {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/pos/manage/users/${profileId}`, {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo eliminar.");
      }

      await refreshUsers(searchTerm);
      if (form.id === profileId) {
        resetForm();
      }
      setMessage("Usuario eliminado definitivamente.");
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleInventoryPermission(user, enabled) {
    if (!canManage || user.role !== "cashier") {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/pos/manage/users/${user.id}/inventory-permission`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message || "No se pudo actualizar el permiso de inventario.",
        );
      }

      await refreshUsers(searchTerm);
      setMessage(
        enabled
          ? "Permiso de inventario habilitado."
          : "Permiso de inventario deshabilitado.",
      );
    } catch (toggleError) {
      setError(toggleError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleProductCreatePermission(user, enabled) {
    if (!canManage || user.role !== "cashier") {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/pos/manage/users/${user.id}/product-create-permission`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message || "No se pudo actualizar el permiso de productos.",
        );
      }

      await refreshUsers(searchTerm);
      setMessage(
        enabled
          ? "Permiso para crear productos habilitado."
          : "Permiso para crear productos deshabilitado.",
      );
    } catch (toggleError) {
      setError(toggleError.message);
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
              Seguridad
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Usuarios
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {activeUsers.length} usuarios activos
            </p>
          </div>

          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              disabled={!canManage}
              placeholder="Buscar por nombre, correo o rol"
              className="h-12 w-full rounded-md border border-neutral-800 bg-neutral-900 px-10 pr-11 text-sm text-neutral-100 transition outline-none placeholder:text-neutral-600 focus:border-neutral-300 disabled:opacity-60"
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

        {!isSuperAdmin && !hasActiveSuperAdmin ? (
          <div className="rounded-md border border-amber-800 bg-amber-950 px-4 py-3 text-sm text-amber-100">
            Aún no existe un super administrador. Puedes crear el primero desde
            el formulario de usuario; después este rol solo podrá gestionarlo
            otro super administrador.
          </div>
        ) : null}

        {!canManage ? (
          <div className="rounded-md border border-yellow-900 bg-yellow-950 px-4 py-3 text-sm text-yellow-100">
            Solo un administrador puede gestionar usuarios.
          </div>
        ) : null}

        <div className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
          <div className="overflow-x-auto">
            <div className="min-w-[1210px]">
              <div className="grid grid-cols-[minmax(190px,1fr)_minmax(210px,1fr)_100px_minmax(190px,1fr)_110px_150px_180px_120px] border-b border-neutral-800 bg-neutral-950 px-4 py-3 text-xs font-medium text-neutral-500 uppercase">
                <span>Usuario</span>
                <span>Correo</span>
                <span>Rol</span>
                <span>Sucursales</span>
                <span>Estado</span>
                <span>Inventario</span>
                <span>Crear productos</span>
                <span className="text-right">Acciones</span>
              </div>

              <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="grid grid-cols-[minmax(190px,1fr)_minmax(210px,1fr)_100px_minmax(190px,1fr)_110px_150px_180px_120px] items-center border-b border-neutral-800 px-4 py-3 text-sm last:border-b-0 hover:bg-neutral-800/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-100">
                        {user.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-neutral-500">
                        {user.userId === currentUserId
                          ? "Tu usuario"
                          : user.userId}
                      </p>
                    </div>
                    <span className="truncate text-neutral-300">
                      {user.email}
                    </span>
                    <span className="font-medium text-neutral-300">
                      {roleLabel(user.role)}
                    </span>
                    <span className="truncate text-neutral-300">
                      {branchNames(user, branchById)}
                    </span>
                    <span
                      className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${
                        user.isActive
                          ? "border-emerald-900 bg-emerald-950 text-emerald-200"
                          : "border-neutral-700 bg-neutral-950 text-neutral-400"
                      }`}
                    >
                      {user.isActive ? "Activo" : "Inactivo"}
                    </span>
                    {user.role === "cashier" ? (
                      <label className="flex w-fit items-center gap-2 text-xs text-neutral-300">
                        <input
                          checked={Boolean(user.canIncreaseInventory)}
                          onChange={(event) =>
                            toggleInventoryPermission(
                              user,
                              event.target.checked,
                            )
                          }
                          disabled={!canManage || !user.isActive || isSaving}
                          type="checkbox"
                          className="peer sr-only"
                        />
                        <span className="relative h-6 w-11 rounded-full border border-neutral-700 bg-neutral-950 transition peer-checked:border-emerald-700 peer-checked:bg-emerald-900 peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-neutral-400 after:transition peer-checked:after:translate-x-5 peer-checked:after:bg-emerald-100" />
                        <span>
                          {user.canIncreaseInventory
                            ? "Habilitado"
                            : "Sin permiso"}
                        </span>
                      </label>
                    ) : (
                      <span className="text-xs text-neutral-500">
                        No aplica
                      </span>
                    )}
                    {user.role === "cashier" ? (
                      <label className="flex w-fit items-center gap-2 text-xs text-neutral-300">
                        <input
                          checked={Boolean(user.canCreateProducts)}
                          onChange={(event) =>
                            toggleProductCreatePermission(
                              user,
                              event.target.checked,
                            )
                          }
                          disabled={!canManage || !user.isActive || isSaving}
                          type="checkbox"
                          className="peer sr-only"
                        />
                        <span className="relative h-6 w-11 rounded-full border border-neutral-700 bg-neutral-950 transition peer-checked:border-emerald-700 peer-checked:bg-emerald-900 peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-neutral-400 after:transition peer-checked:after:translate-x-5 peer-checked:after:bg-emerald-100" />
                        <span>
                          {user.canCreateProducts
                            ? "Habilitado"
                            : "Sin permiso"}
                        </span>
                      </label>
                    ) : (
                      <span className="text-xs text-neutral-500">
                        No aplica
                      </span>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => editUser(user)}
                        disabled={user.role === "super_admin" && !isSuperAdmin}
                        className="grid size-9 place-items-center rounded-md border border-neutral-700 text-neutral-300 transition hover:border-neutral-300 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Editar"
                      >
                        <Edit3 className="size-4" />
                      </button>
                      {canManage && user.userId !== currentUserId ? (
                        <button
                          type="button"
                          onClick={() => deleteUser(user.id)}
                          className="grid size-9 place-items-center rounded-md border border-neutral-700 text-neutral-300 transition hover:border-red-500 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={
                            user.role === "super_admin" && !isSuperAdmin
                          }
                          title="Eliminar definitivamente"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {users.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-neutral-500">
                    No hay usuarios para mostrar.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <form
        onSubmit={saveUser}
        className="h-fit rounded-md border border-neutral-800 bg-neutral-900 p-4"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-4">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase">
              {form.id ? "Edicion" : "Nuevo"}
            </p>
            <h2 className="mt-1 text-lg font-semibold">Usuario</h2>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-neutral-300 transition hover:border-neutral-300 hover:text-neutral-100"
            >
              <UserPlus className="size-4" />
              Nuevo
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3">
          <label className="text-xs font-medium text-neutral-400">
            Nombre
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              disabled={!canEditForm}
              className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
            />
          </label>

          <label className="text-xs font-medium text-neutral-400">
            Correo
            <input
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              disabled={!canEditForm}
              type="email"
              autoComplete="email"
              className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
            />
          </label>

          <label className="text-xs font-medium text-neutral-400">
            Contrasena
            <div className="relative mt-1">
              <input
                value={form.password}
                onChange={(event) =>
                  updateField("password", event.target.value)
                }
                disabled={!canEditForm}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder={form.id ? "Opcional al editar" : ""}
                className="h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 pr-11 text-sm text-neutral-100 transition outline-none placeholder:text-neutral-600 focus:border-neutral-300 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                disabled={!canEditForm}
                className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-50"
                aria-label={
                  showPassword ? "Ocultar contrasena" : "Ver contrasena"
                }
                title={showPassword ? "Ocultar contrasena" : "Ver contrasena"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-neutral-400">
              Rol
              <select
                value={form.role}
                onChange={(event) => updateField("role", event.target.value)}
                disabled={!canEditForm || isEditingSelf}
                className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
              >
                <option value="cashier">Cajero</option>
                <option value="admin">Admin</option>
                {canAssignSuperAdmin || form.role === "super_admin" ? (
                  <option value="super_admin">Super administrador</option>
                ) : null}
              </select>
            </label>

            <label className="flex items-end gap-2 pb-3 text-sm text-neutral-300">
              <input
                checked={form.isActive}
                onChange={(event) =>
                  updateField("isActive", event.target.checked)
                }
                disabled={!canEditForm || isEditingSelf}
                type="checkbox"
                className="size-4 accent-neutral-100"
              />
              Usuario activo
            </label>
          </div>
        </div>

        <div className="mt-5 border-t border-neutral-800 pt-4">
          <p className="text-xs font-medium text-neutral-500 uppercase">
            Sucursales de venta
          </p>
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
            {branches.map((branch) => (
              <label
                key={branch.id}
                className="flex items-start gap-3 rounded-md border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300"
              >
                <input
                  checked={(form.allowedBranchIds || []).includes(branch.id)}
                  onChange={() => toggleBranch(branch.id)}
                  disabled={!canEditForm}
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-neutral-100"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-neutral-100">
                    {branch.name}
                  </span>
                  <span className="mt-1 block truncate text-xs text-neutral-500">
                    {branch.city}
                  </span>
                </span>
              </label>
            ))}

            {branches.length === 0 ? (
              <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-8 text-center text-sm text-neutral-500">
                No hay sucursales activas.
              </div>
            ) : null}
          </div>
        </div>

        {canEditForm ? (
          <button
            type="submit"
            disabled={isSaving || branches.length === 0}
            className="mt-5 h-12 w-full rounded-md bg-neutral-100 text-sm font-semibold text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            {isSaving ? "Guardando..." : "Guardar usuario"}
          </button>
        ) : null}
      </form>
    </section>
  );
}

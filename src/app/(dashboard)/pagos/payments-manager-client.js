"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  CircleAlert,
  CircleCheck,
  CreditCard,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Power,
  QrCode,
  RotateCcw,
  Save,
  Wifi,
  WifiOff,
} from "lucide-react";

const paymentIcons = {
  cash: Banknote,
  qr: QrCode,
  card: CreditCard,
};

const paymentNames = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
};

const emptyForm = {
  id: "",
  branchId: "",
  type: "",
  label: "",
  isEnabled: true,
  sortOrder: 0,
  config: {},
};

const emptyCredentialsForm = {
  apiUsername: "",
  apiPassword: "",
  aesKey: "",
  accountCredit: "",
};

function toForm(method) {
  return {
    ...emptyForm,
    ...method,
    config: method.config || {},
  };
}

function providerLabel(method) {
  if (method.type === "qr" && method.config?.provider === "baneco") {
    return "QR Simple Baneco";
  }

  return paymentNames[method.type] || method.type;
}

function formatCheckedAt(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getConnectionMeta(credentials, isChecking) {
  if (isChecking) {
    return {
      Icon: Loader2,
      label: "Probando conexion Baneco",
      message: "Validando las credenciales con el servidor de Baneco.",
      className: "border-sky-900 bg-sky-950 text-sky-100",
      iconClassName: "animate-spin text-sky-300",
    };
  }

  if (credentials?.connectionStatus === "online") {
    return {
      Icon: CircleCheck,
      label: "Conexion Baneco activa",
      message: `Ultima prueba: ${
        formatCheckedAt(credentials.connectionCheckedAt) || "reciente"
      }.`,
      className: "border-emerald-900 bg-emerald-950 text-emerald-100",
      iconClassName: "text-emerald-300",
    };
  }

  if (credentials?.connectionStatus === "failed") {
    return {
      Icon: CircleAlert,
      label: "Sin conexion Baneco",
      message:
        credentials.connectionMessage ||
        "Baneco no confirmo la conexion con estas credenciales.",
      className: "border-red-900 bg-red-950 text-red-100",
      iconClassName: "text-red-300",
    };
  }

  if (credentials?.configured) {
    return {
      Icon: WifiOff,
      label: "Conexion no comprobada",
      message: "Las credenciales estan guardadas, pero falta probar conexion.",
      className: "border-yellow-900 bg-yellow-950 text-yellow-100",
      iconClassName: "text-yellow-300",
    };
  }

  return {
    Icon: WifiOff,
    label: "Sin credenciales Baneco",
    message: "Guarda las llaves de esta sucursal para probar la conexion.",
    className: "border-neutral-800 bg-neutral-950 text-neutral-300",
    iconClassName: "text-neutral-500",
  };
}

export default function PaymentsManagerClient({
  branches,
  initialMethods,
  baneco,
  canManage,
}) {
  const [methods, setMethods] = useState(initialMethods);
  const [selectedBranchId, setSelectedBranchId] = useState(
    branches[0]?.id || "",
  );
  const [form, setForm] = useState(() => {
    const firstMethod = initialMethods.find(
      (method) => method.branchId === branches[0]?.id,
    );
    return firstMethod ? toForm(firstMethod) : emptyForm;
  });
  const [credentialsForm, setCredentialsForm] = useState(emptyCredentialsForm);
  const [showCredentials, setShowCredentials] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [togglingMethodId, setTogglingMethodId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId),
    [branches, selectedBranchId],
  );
  const branchMethods = useMemo(
    () =>
      methods
        .filter((method) => method.branchId === selectedBranchId)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [methods, selectedBranchId],
  );
  const banecoConfiguredCount = branchMethods.filter(
    (method) =>
      method.type === "qr" &&
      method.config?.provider === "baneco" &&
      method.credentials?.configured,
  ).length;
  const banecoOnlineCount = branchMethods.filter(
    (method) =>
      method.type === "qr" &&
      method.config?.provider === "baneco" &&
      method.credentials?.connectionStatus === "online",
  ).length;
  const credentialsConnection = getConnectionMeta(
    form.credentials,
    isSavingCredentials || isTestingConnection,
  );
  const CredentialsConnectionIcon = credentialsConnection.Icon;
  const selectedBanecoBaseUrl = baneco?.productionBaseUrl;

  function selectBranch(branchId) {
    const nextMethod = methods.find((method) => method.branchId === branchId);

    setSelectedBranchId(branchId);
    setForm(nextMethod ? toForm(nextMethod) : emptyForm);
    setCredentialsForm(emptyCredentialsForm);
    setShowCredentials(false);
    setIsTestingConnection(false);
    setMessage("");
    setError("");
  }

  function editMethod(method) {
    setForm(toForm(method));
    setCredentialsForm(emptyCredentialsForm);
    setShowCredentials(false);
    setIsTestingConnection(false);
    setMessage("");
    setError("");
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateConfig(field, value) {
    setForm((current) => ({
      ...current,
      config: {
        ...(current.config || {}),
        [field]: value,
      },
    }));
  }

  function updateCredentialField(field, value) {
    setCredentialsForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    const currentMethod = methods.find((method) => method.id === form.id);

    setForm(currentMethod ? toForm(currentMethod) : emptyForm);
    setCredentialsForm(emptyCredentialsForm);
    setShowCredentials(false);
    setIsTestingConnection(false);
    setMessage("");
    setError("");
  }

  function applyCredentialsStatus(credentials) {
    setMethods((current) =>
      current.map((method) =>
        method.id === form.id
          ? {
              ...method,
              credentials,
            }
          : method,
      ),
    );
    setForm((current) => ({
      ...current,
      credentials,
    }));
  }

  async function refreshPayments(branchId = selectedBranchId) {
    const params = new URLSearchParams({ branchId });
    const response = await fetch(`/api/pos/manage/payments?${params}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || "No se pudieron cargar pagos.");
    }

    setMethods((current) => {
      const otherMethods = current.filter(
        (method) => method.branchId !== branchId,
      );
      return [...otherMethods, ...payload.methods];
    });

    return payload.methods;
  }

  async function saveMethod(event) {
    event.preventDefault();

    if (!canManage || !form.id) {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/pos/manage/payments/${form.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo guardar el metodo.");
      }

      const updatedMethods = await refreshPayments(form.branchId);
      const refreshedMethod =
        updatedMethods.find((method) => method.id === payload.method.id) ||
        payload.method;
      setForm(toForm(refreshedMethod));
      setMessage("Metodo de pago guardado.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleMethod(method) {
    if (!canManage || !method?.id || togglingMethodId) {
      return;
    }

    setTogglingMethodId(method.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/pos/manage/payments/${method.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...method,
          isEnabled: !method.isEnabled,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo cambiar el estado.");
      }

      const updatedMethods = await refreshPayments(method.branchId);
      const refreshedMethod =
        updatedMethods.find((item) => item.id === method.id) ||
        payload.method;

      if (form.id === method.id) {
        setForm(toForm(refreshedMethod));
      }

      setMessage(
        refreshedMethod.isEnabled
          ? "Metodo de pago activado."
          : "Metodo de pago desactivado.",
      );
    } catch (toggleError) {
      setError(toggleError.message);
    } finally {
      setTogglingMethodId("");
    }
  }

  async function saveCredentials(event) {
    event?.preventDefault();

    if (!canManage || !form.id) {
      return;
    }

    setIsSavingCredentials(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/pos/manage/payments/${form.id}/baneco-credentials`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(credentialsForm),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message || "No se pudieron guardar credenciales.",
        );
      }

      applyCredentialsStatus(payload.credentials);
      setCredentialsForm(emptyCredentialsForm);
      setShowCredentials(false);

      if (payload.credentials?.connectionStatus === "online") {
        setMessage("Credenciales guardadas. Conexion Baneco activa.");
      } else {
        setError(
          `Credenciales guardadas, pero ${
            payload.credentials?.connectionMessage ||
            "Baneco no confirmo la conexion."
          }`,
        );
      }
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSavingCredentials(false);
    }
  }

  async function testConnection(event) {
    event?.preventDefault();

    if (!canManage || !form.id || !form.credentials?.configured) {
      return;
    }

    setIsTestingConnection(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/pos/manage/payments/${form.id}/baneco-credentials`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "No se pudo probar la conexion.");
      }

      applyCredentialsStatus(payload.credentials);

      if (payload.credentials?.connectionStatus === "online") {
        setMessage("Conexion Baneco activa.");
      } else {
        setError(
          payload.credentials?.connectionMessage ||
            "Baneco no confirmo la conexion.",
        );
      }
    } catch (testError) {
      setError(testError.message);
    } finally {
      setIsTestingConnection(false);
    }
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-neutral-800 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase">
              Configuracion
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Pagos
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {selectedBranch?.name || "Sin sucursal seleccionada"}
            </p>
          </div>

          <label className="w-full text-xs font-medium text-neutral-400 lg:max-w-sm">
            Sucursal
            <select
              value={selectedBranchId}
              onChange={(event) => selectBranch(event.target.value)}
              disabled={!canManage}
              className="mt-1 h-12 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!canManage ? (
          <div className="rounded-md border border-yellow-900 bg-yellow-950 px-4 py-3 text-sm text-yellow-100">
            Solo un administrador puede gestionar metodos de pago.
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

        <div className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
          <div className="grid grid-cols-[minmax(220px,1fr)_150px_130px_120px_140px] border-b border-neutral-800 bg-neutral-950 px-4 py-3 text-xs font-medium text-neutral-500 uppercase">
            <span>Metodo</span>
            <span>Proveedor</span>
            <span>Orden</span>
            <span>Estado</span>
            <span className="text-right">Accion</span>
          </div>

          <div>
            {branchMethods.map((method) => {
              const Icon = paymentIcons[method.type] || CreditCard;
              const isEditing = method.id === form.id;

              return (
                <div
                  key={method.id}
                  className="grid grid-cols-[minmax(220px,1fr)_150px_130px_120px_140px] items-center border-b border-neutral-800 px-4 py-3 text-sm last:border-b-0 hover:bg-neutral-800/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-md border border-neutral-800 bg-neutral-950 text-neutral-300">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-100">
                        {method.label}
                      </p>
                      <p className="mt-1 truncate text-xs text-neutral-500">
                        {paymentNames[method.type]}
                      </p>
                    </div>
                  </div>
                  <span className="truncate text-neutral-300">
                    {providerLabel(method)}
                  </span>
                  <span className="text-neutral-300">{method.sortOrder}</span>
                  <span
                    className={`w-fit rounded-md border px-2 py-1 text-xs font-medium ${
                      method.isEnabled
                        ? "border-emerald-900 bg-emerald-950 text-emerald-200"
                        : "border-neutral-700 bg-neutral-950 text-neutral-400"
                    }`}
                  >
                    {method.isEnabled ? "Activo" : "Inactivo"}
                  </span>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => toggleMethod(method)}
                      disabled={!canManage || Boolean(togglingMethodId)}
                      className={`grid size-9 place-items-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        method.isEnabled
                          ? "border-emerald-900 text-emerald-300 hover:border-emerald-600 hover:text-emerald-100"
                          : "border-neutral-700 text-neutral-500 hover:border-neutral-300 hover:text-neutral-100"
                      }`}
                      title={
                        method.isEnabled
                          ? "Desactivar metodo"
                          : "Activar metodo"
                      }
                    >
                      {togglingMethodId === method.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Power className="size-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => editMethod(method)}
                      className={`grid size-9 place-items-center rounded-md border text-neutral-300 transition hover:border-neutral-300 hover:text-neutral-100 ${
                        isEditing ? "border-neutral-300" : "border-neutral-700"
                      }`}
                      title="Editar"
                    >
                      <Edit3 className="size-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {branchMethods.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-neutral-500">
                No hay metodos para esta sucursal.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-md border border-neutral-800 bg-neutral-900 p-4">
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-neutral-500 uppercase">
                QR Simple Baneco
              </p>
              <p className="mt-2 font-medium text-neutral-100">
                {banecoOnlineCount > 0
                  ? "Con conexion Baneco"
                  : banecoConfiguredCount > 0
                    ? "Credenciales sin conexion activa"
                    : "Sin credenciales por sucursal"}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {banecoConfiguredCount > 0
                  ? `${banecoOnlineCount} de ${banecoConfiguredCount} configuradas con conexion`
                  : "Configura las llaves por sucursal"}
              </p>
            </div>
            <div className="md:text-right">
              <p className="text-xs font-medium text-neutral-500 uppercase">
                Ambiente Baneco
              </p>
              <p className="mt-2 truncate text-neutral-300">Produccion</p>
              <p className="mt-1 truncate text-xs text-neutral-500">
                {selectedBanecoBaseUrl || "-"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <form
        onSubmit={saveMethod}
        className="h-fit rounded-md border border-neutral-800 bg-neutral-900 p-4"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-4">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase">
              Metodo
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {form.label || "Selecciona un metodo"}
            </h2>
          </div>
          <button
            type="button"
            onClick={resetForm}
            disabled={!form.id}
            className="grid size-10 place-items-center rounded-md border border-neutral-700 text-neutral-300 transition hover:border-neutral-300 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            title="Restablecer"
          >
            <RotateCcw className="size-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="text-xs font-medium text-neutral-400">
            Nombre
            <input
              value={form.label}
              onChange={(event) => updateField("label", event.target.value)}
              disabled={!canManage || !form.id}
              className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-neutral-400">
              Orden
              <input
                value={form.sortOrder}
                onChange={(event) =>
                  updateField("sortOrder", event.target.value)
                }
                disabled={!canManage || !form.id}
                type="number"
                min="0"
                max="99"
                className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
              />
            </label>

            <label className="flex items-end gap-2 pb-3 text-sm text-neutral-300">
              <input
                checked={form.isEnabled}
                onChange={(event) =>
                  updateField("isEnabled", event.target.checked)
                }
                disabled={!canManage || !form.id}
                type="checkbox"
                className="size-4 accent-neutral-100"
              />
              Metodo activo
            </label>
          </div>

          {form.type === "qr" ? (
            <div className="grid gap-3 border-t border-neutral-800 pt-4">
              <label className="text-xs font-medium text-neutral-400">
                Proveedor QR
                <select
                  value={form.config?.provider || "manual"}
                  onChange={(event) =>
                    updateConfig("provider", event.target.value)
                  }
                  disabled={!canManage || !form.id}
                  className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                >
                  <option value="manual">Manual</option>
                  <option value="baneco">QR Simple Baneco</option>
                </select>
              </label>

              {form.config?.provider === "baneco" ? (
                <>
                  <label className="text-xs font-medium text-neutral-400">
                    Prefijo descripcion
                    <input
                      value={form.config?.descriptionPrefix || ""}
                      onChange={(event) =>
                        updateConfig("descriptionPrefix", event.target.value)
                      }
                      disabled={!canManage || !form.id}
                      className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                    />
                  </label>

                  <div className="grid gap-2">
                    <label className="flex items-center gap-2 text-sm text-neutral-300">
                      <input
                        checked={form.config?.singleUse !== false}
                        onChange={(event) =>
                          updateConfig("singleUse", event.target.checked)
                        }
                        disabled={!canManage || !form.id}
                        type="checkbox"
                        className="size-4 accent-neutral-100"
                      />
                      Un solo uso
                    </label>
                    <label className="flex items-center gap-2 text-sm text-neutral-300">
                      <input
                        checked={
                          form.config?.requireOnlineConfirmation === true
                        }
                        onChange={(event) =>
                          updateConfig(
                            "requireOnlineConfirmation",
                            event.target.checked,
                          )
                        }
                        disabled={!canManage || !form.id}
                        type="checkbox"
                        className="size-4 accent-neutral-100"
                      />
                      Confirmacion online
                    </label>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        {canManage ? (
          <button
            type="submit"
            disabled={isSaving || !form.id}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-neutral-100 text-sm font-semibold text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            <Save className="size-4" />
            {isSaving ? "Guardando..." : "Guardar metodo"}
          </button>
        ) : null}

        {form.type === "qr" && form.config?.provider === "baneco" ? (
          <div className="mt-5 border-t border-neutral-800 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-neutral-500 uppercase">
                  Llaves Baneco
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  {form.credentials?.configured
                    ? `Configuradas: ${form.credentials.apiUsernameMasked || "-"} / ${
                        form.credentials.accountCreditMasked || "-"
                      }`
                    : "Pendientes para esta sucursal"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {form.credentials?.configured ? (
                  <button
                    type="button"
                    onClick={testConnection}
                    disabled={isTestingConnection || isSavingCredentials}
                    className="grid size-10 place-items-center rounded-md border border-neutral-700 text-neutral-300 transition hover:border-neutral-300 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Probar conexion"
                  >
                    <Wifi className="size-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowCredentials((current) => !current)}
                  className="grid size-10 place-items-center rounded-md border border-neutral-700 text-neutral-300 transition hover:border-neutral-300 hover:text-neutral-100"
                  title={showCredentials ? "Ocultar llaves" : "Mostrar llaves"}
                >
                  {showCredentials ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <div
              className={`mt-3 flex items-start gap-3 rounded-md border px-3 py-2 ${credentialsConnection.className}`}
            >
              <CredentialsConnectionIcon
                className={`mt-0.5 size-4 shrink-0 ${credentialsConnection.iconClassName}`}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {credentialsConnection.label}
                </p>
                <p className="mt-1 text-xs opacity-80">
                  {credentialsConnection.message}
                </p>
              </div>
            </div>

            {showCredentials ? (
              <div className="mt-4 grid gap-3">
                <label className="text-xs font-medium text-neutral-400">
                  Usuario API
                  <input
                    value={credentialsForm.apiUsername}
                    onChange={(event) =>
                      updateCredentialField("apiUsername", event.target.value)
                    }
                    disabled={!canManage || !form.id}
                    autoComplete="off"
                    className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                  />
                </label>

                <label className="text-xs font-medium text-neutral-400">
                  Password API
                  <input
                    value={credentialsForm.apiPassword}
                    onChange={(event) =>
                      updateCredentialField("apiPassword", event.target.value)
                    }
                    disabled={!canManage || !form.id}
                    type="password"
                    autoComplete="new-password"
                    className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                  />
                </label>

                <label className="text-xs font-medium text-neutral-400">
                  AES key
                  <input
                    value={credentialsForm.aesKey}
                    onChange={(event) =>
                      updateCredentialField("aesKey", event.target.value)
                    }
                    disabled={!canManage || !form.id}
                    autoComplete="off"
                    maxLength={32}
                    className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                  />
                </label>

                <label className="text-xs font-medium text-neutral-400">
                  Cuenta de abono
                  <input
                    value={credentialsForm.accountCredit}
                    onChange={(event) =>
                      updateCredentialField("accountCredit", event.target.value)
                    }
                    disabled={!canManage || !form.id}
                    autoComplete="off"
                    className="mt-1 h-11 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition outline-none focus:border-neutral-300 disabled:opacity-60"
                  />
                </label>

                <button
                  type="button"
                  onClick={saveCredentials}
                  disabled={
                    isSavingCredentials || isTestingConnection || !form.id
                  }
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-neutral-700 px-3 text-sm font-semibold text-neutral-200 transition hover:border-neutral-300 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <KeyRound className="size-4" />
                  {isSavingCredentials
                    ? "Probando conexion..."
                    : "Guardar y probar conexion"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}

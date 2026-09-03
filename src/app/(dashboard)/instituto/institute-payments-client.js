"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Check,
  GraduationCap,
  Loader2,
  Plus,
  QrCode,
  Search,
} from "lucide-react";

function money(value) {
  return new Intl.NumberFormat("es-BO", {
    currency: "BOB",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "short",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).format(date);
}

async function readResponse(response) {
  const body = await response.text();

  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new Error("El servicio de Instituto respondió de forma inválida.");
  }
}

function getStudentStatus(student) {
  const value =
    student?.isActive ??
    student?.activo ??
    student?.estado ??
    student?.status ??
    student?.estadoActual;

  if (typeof value === "boolean") {
    return value
      ? { label: "Activo", tone: "active" }
      : { label: "Inactivo", tone: "inactive" };
  }

  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (["activo", "active", "habilitado", "enabled"].includes(normalized)) {
    return { label: "Activo", tone: "active" };
  }

  if (
    ["inactivo", "inactive", "suspendido", "suspended", "retirado"].includes(
      normalized,
    )
  ) {
    return { label: "Inactivo", tone: "inactive" };
  }

  return { label: value ? String(value) : "Sin estado", tone: "unknown" };
}

function normalizeBranchName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function belongsToSelectedBranch(courseBranchName, selectedBranchName) {
  if (!selectedBranchName) return true;

  return (
    normalizeBranchName(courseBranchName) ===
    normalizeBranchName(selectedBranchName)
  );
}

export default function InstitutePaymentsClient({
  embedded = false,
  cartPaymentIds = [],
  onCartChange,
  selectedBranchId = "",
  selectedBranchName = "",
}) {
  const [ci, setCi] = useState("");
  const [ledger, setLedger] = useState(null);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("efectivo");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const pendingPayments = useMemo(
    () =>
      (ledger?.cursos || []).flatMap((course) =>
        belongsToSelectedBranch(course.sucursalNombre, selectedBranchName)
          ? (course.pagosPendientes || []).map((payment) => ({
              ...payment,
              courseBranchName: course.sucursalNombre,
              courseName: course.courseName,
            }))
          : [],
      ),
    [ledger, selectedBranchName],
  );
  const selectedPayments = useMemo(
    () =>
      selectedPaymentIds
        .map((paymentId) =>
          pendingPayments.find((payment) => payment.$id === paymentId),
        )
        .filter(Boolean),
    [pendingPayments, selectedPaymentIds],
  );
  const selectedTotal = useMemo(
    () => selectedPayments.reduce((total, payment) => total + payment.saldo, 0),
    [selectedPayments],
  );
  const amountToRegister = Number(amount);
  const isAmountValid =
    selectedPayments.length > 0 &&
    Number.isFinite(amountToRegister) &&
    amountToRegister > 0 &&
    amountToRegister <= selectedTotal;

  const cartPaymentIdsSignature = cartPaymentIds.join("|");

  useEffect(() => {
    if (!embedded) return;

    setSelectedPaymentIds((current) =>
      current.join("|") === cartPaymentIdsSignature ? current : cartPaymentIds,
    );
  }, [cartPaymentIds, cartPaymentIdsSignature, embedded]);

  useEffect(() => {
    if (!embedded || !onCartChange) return;

    onCartChange({
      ci: ledger?.estudiante?.documento || ci.trim(),
      payments: selectedPayments,
      studentName: ledger?.estudiante?.nombre || "Estudiante",
    });
  }, [ci, embedded, ledger, onCartChange, selectedPayments]);

  function togglePayment(paymentId) {
    setSelectedPaymentIds((current) =>
      current.includes(paymentId)
        ? current.filter((currentId) => currentId !== paymentId)
        : [...current, paymentId],
    );
  }

  async function searchStudent(event) {
    event.preventDefault();
    const cleanCi = ci.trim();
    if (!cleanCi) {
      setError("Ingresa el CI del estudiante.");
      return;
    }

    setError("");
    setNotice("");
    setLedger(null);
    setSelectedPaymentIds([]);
    setAmount("");
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/pos/instituto-pagos?ci=${encodeURIComponent(cleanCi)}&branchId=${encodeURIComponent(selectedBranchId)}`,
      );
      const result = await readResponse(response);
      if (!response.ok) {
        throw new Error(result.error || "No se encontró al estudiante.");
      }
      setLedger(result);
    } catch (searchError) {
      setError(searchError.message || "No se pudo consultar al estudiante.");
    } finally {
      setIsLoading(false);
    }
  }

  async function registerPayment() {
    if (!isAmountValid) {
      setError("Selecciona cuotas e ingresa un monto válido.");
      return;
    }

    setError("");
    setNotice("");
    setIsRegistering(true);
    let remainingAmount = Number(amountToRegister.toFixed(2));
    let registeredCount = 0;

    try {
      for (const payment of selectedPayments) {
        if (remainingAmount <= 0) break;
        const monto = Math.min(payment.saldo, remainingAmount);
        const response = await fetch("/api/pos/instituto-pagos", {
          body: JSON.stringify({
            ci: ledger.estudiante.documento,
            branchId: selectedBranchId,
            metodoPago: method,
            monto: Number(monto.toFixed(2)),
            notas: "Registro desde POS V1",
            paymentId: payment.$id,
            referencia: reference,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const result = await readResponse(response);
        if (!response.ok) {
          throw new Error(
            result.error || result.message || "No se pudo registrar el pago.",
          );
        }
        remainingAmount = Number((remainingAmount - monto).toFixed(2));
        registeredCount += 1;
      }

      setNotice(
        `${registeredCount} pago(s) registrado(s) por ${money(amountToRegister - remainingAmount)}.`,
      );
      setSelectedPaymentIds([]);
      setAmount("");
      setReference("");
      const response = await fetch(
        `/api/pos/instituto-pagos?ci=${encodeURIComponent(ci.trim())}&branchId=${encodeURIComponent(selectedBranchId)}`,
      );
      const refreshedLedger = await readResponse(response);
      if (response.ok) setLedger(refreshedLedger);
    } catch (paymentError) {
      setError(paymentError.message || "No se pudo registrar el pago.");
    } finally {
      setIsRegistering(false);
    }
  }

  const searchForm = (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <form className="flex flex-wrap gap-3" onSubmit={searchStudent}>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-neutral-400 focus-within:border-cyan-400">
          <Search className="size-4" />
          <input
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-600"
            onChange={(event) => setCi(event.target.value)}
            placeholder="Carnet de identidad del estudiante"
            value={ci}
          />
        </label>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          type="submit"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Buscar estudiante
        </button>
      </form>
    </section>
  );

  const messages = (
    <>
      {error ? (
        <p className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-emerald-900 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </p>
      ) : null}
    </>
  );

  const studentLedger = ledger ? (
    <div className="space-y-4">
      <header className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-neutral-500">Estudiante</p>
            <h2 className="mt-1 text-lg font-semibold">
              {ledger.estudiante.nombre}
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              CI {ledger.estudiante.documento} · Deuda total{" "}
              {money(ledger.deudaTotal)}
            </p>
          </div>
          {(() => {
            const status = getStudentStatus(ledger.estudiante);
            const tone =
              status.tone === "active"
                ? "border-emerald-800 bg-emerald-950/60 text-emerald-200"
                : status.tone === "inactive"
                  ? "border-red-800 bg-red-950/60 text-red-200"
                  : "border-neutral-700 bg-neutral-950 text-neutral-300";

            return (
              <span
                className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${tone}`}
              >
                {status.label}
              </span>
            );
          })()}
        </div>
      </header>

      {(ledger.cursos || []).map((course) => (
        <article
          className={`overflow-hidden rounded-lg border ${
            belongsToSelectedBranch(course.sucursalNombre, selectedBranchName)
              ? "border-cyan-800 bg-cyan-950/20"
              : "border-neutral-800 bg-neutral-900/50 opacity-60"
          }`}
          key={course.enrollmentId}
        >
          <header
            className={`flex items-center justify-between gap-4 border-b px-4 py-3 ${
              belongsToSelectedBranch(course.sucursalNombre, selectedBranchName)
                ? "border-cyan-800 bg-cyan-950/45"
                : "border-neutral-800 bg-neutral-950/50"
            }`}
          >
            <div>
              <h3 className="font-semibold">{course.courseName}</h3>
              <p className="mt-1 text-sm text-neutral-500">
                {course.sucursalNombre}
              </p>
            </div>
            <strong className="text-cyan-300">
              {money(course.deudaTotal)}
            </strong>
          </header>
          <div
            className={
              belongsToSelectedBranch(course.sucursalNombre, selectedBranchName)
                ? "divide-y divide-cyan-950/80"
                : "divide-y divide-neutral-800"
            }
          >
            {(course.pagosPendientes || []).map((payment) => {
              const selected = selectedPaymentIds.includes(payment.$id);
              const canCharge = belongsToSelectedBranch(
                course.sucursalNombre,
                selectedBranchName,
              );
              return (
                <div
                  className={`flex items-center justify-between gap-3 px-4 py-3 transition ${selected ? "bg-cyan-950/60" : "hover:bg-cyan-950/35"}`}
                  key={payment.$id}
                >
                  <span className="min-w-0">
                    <strong className="block text-sm">{payment.periodo}</strong>
                    <span className="text-xs text-neutral-400">
                      Vence {formatDate(payment.fechaVencimiento)}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-4">
                    <strong className="text-sm">{money(payment.saldo)}</strong>
                    <button
                      aria-pressed={selected}
                      className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
                        !canCharge
                          ? "cursor-not-allowed bg-neutral-800 text-neutral-500"
                          : selected
                            ? "bg-cyan-100 text-cyan-950 hover:bg-white"
                            : "bg-cyan-400 text-cyan-950 hover:bg-cyan-300"
                      }`}
                      disabled={!canCharge}
                      onClick={() => togglePayment(payment.$id)}
                      type="button"
                    >
                      {selected ? (
                        <Check className="size-4" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                      {!canCharge
                        ? "Otra sucursal"
                        : selected
                          ? "Agregado"
                          : "Agregar a cobro"}
                    </button>
                  </div>
                </div>
              );
            })}
            {!course.pagosPendientes?.length ? (
              <p className="px-4 py-4 text-sm text-neutral-500">
                No tiene cuotas pendientes.
              </p>
            ) : null}
          </div>
        </article>
      ))}
      {!ledger.cursos?.length ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-8 text-center text-sm text-neutral-500">
          El estudiante no tiene inscripciones activas.
        </div>
      ) : null}
    </div>
  ) : null;

  const standaloneCheckout = (
    <aside className="h-fit rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 lg:sticky lg:top-6">
      <p className="text-sm text-neutral-500">Cobro POS</p>
      <h2 className="mt-1 text-lg font-semibold">
        {selectedPayments.length
          ? `${selectedPayments.length} cuota(s) seleccionada(s)`
          : "Selecciona cuotas"}
      </h2>
      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Saldo seleccionado</dt>
          <dd>{money(selectedTotal)}</dd>
        </div>
      </dl>
      <label className="mt-5 grid gap-2 text-sm text-neutral-300">
        Monto a cobrar
        <input
          className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none focus:border-cyan-400 disabled:opacity-50"
          disabled={!selectedPayments.length}
          max={selectedTotal || 0}
          min="0.01"
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
          step="0.01"
          type="number"
          value={amount}
        />
      </label>
      <label className="mt-4 grid gap-2 text-sm text-neutral-300">
        Método confirmado
        <select
          className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none focus:border-cyan-400"
          onChange={(event) => setMethod(event.target.value)}
          value={method}
        >
          <option value="efectivo">Efectivo</option>
          <option value="qr">QR confirmado</option>
        </select>
      </label>
      <label className="mt-4 grid gap-2 text-sm text-neutral-300">
        Referencia
        <input
          className="h-11 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-neutral-100 outline-none focus:border-cyan-400"
          onChange={(event) => setReference(event.target.value)}
          placeholder="Opcional"
          value={reference}
        />
      </label>
      <button
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-400 px-4 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!isAmountValid || isRegistering}
        onClick={registerPayment}
        type="button"
      >
        {isRegistering ? (
          <Loader2 className="size-4 animate-spin" />
        ) : method === "qr" ? (
          <QrCode className="size-4" />
        ) : (
          <Banknote className="size-4" />
        )}
        Registrar pago
      </button>
      <p className="mt-3 text-xs leading-5 text-neutral-500">
        Para QR, registra el pago solo después de confirmar la transacción.
      </p>
    </aside>
  );

  if (embedded) {
    return (
      <section className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-neutral-300">
            <GraduationCap className="size-4 text-cyan-400" />
            <span className="font-medium">
              Selecciona las cuotas para agregarlas al carrito POS.
            </span>
          </div>
          {searchForm}
          {messages}
          {studentLedger}
          {ledger ? (
            <p className="rounded-md border border-cyan-900 bg-cyan-950/30 px-4 py-3 text-sm text-cyan-100">
              {selectedPayments.length
                ? `${selectedPayments.length} cuota(s), por ${money(selectedTotal)}, están listas en el carrito lateral.`
                : "Selecciona una o más cuotas; el pago se realiza desde el carrito lateral."}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-full bg-neutral-950 p-4 text-neutral-100 lg:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-cyan-400 uppercase">
              Control Instituto
            </p>
            <h1 className="mt-1 text-2xl font-semibold">
              Cobro de mensualidades
            </h1>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-cyan-900 bg-cyan-950/40 px-3 py-2 text-sm text-cyan-100">
            <GraduationCap className="size-4" />
            Conectado al Instituto
          </div>
        </header>
        {searchForm}
        {messages}
        {ledger ? (
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            {studentLedger}
            {standaloneCheckout}
          </section>
        ) : null}
      </div>
    </main>
  );
}

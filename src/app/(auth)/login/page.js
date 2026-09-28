"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "No se pudo iniciar sesion.");
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setError(error.message);
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 py-12 text-neutral-100">
      <section className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-xs font-medium tracking-[0.18em] text-neutral-400 uppercase">
            POS V1
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Iniciar sesion
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            Accede para entrar al area privada del punto de venta.
          </p>
        </div>

        {isMounted ? (
          <form
            onSubmit={handleSubmit}
            className="rounded-md border border-neutral-800 bg-neutral-900 p-6 shadow-sm shadow-black/20"
          >
            <div className="space-y-5">
              <label className="block">
                <span className="text-sm font-medium text-neutral-300">
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 transition outline-none placeholder:text-neutral-500 focus:border-neutral-300 focus:ring-2 focus:ring-white/10"
                  placeholder="usuario@empresa.com"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-300">
                  Contrasena
                </span>
                <div className="relative mt-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2.5 pr-24 text-sm text-neutral-100 transition outline-none placeholder:text-neutral-500 focus:border-neutral-300 focus:ring-2 focus:ring-white/10"
                    placeholder="********"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={
                      showPassword ? "Ocultar contrasena" : "Mostrar contrasena"
                    }
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-1 flex min-w-20 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300"
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" size={18} strokeWidth={1.8} />
                    ) : (
                      <Eye aria-hidden="true" size={18} strokeWidth={1.8} />
                    )}
                    {showPassword ? "Ocultar" : "Ver"}
                  </button>
                </div>
              </label>
            </div>

            {error && (
              <p className="mt-5 rounded-md border border-red-900/70 bg-red-950/50 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 w-full rounded-md bg-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        ) : (
          <div
            aria-hidden="true"
            className="rounded-md border border-neutral-800 bg-neutral-900 p-6 shadow-sm shadow-black/20"
          >
            <div className="space-y-5">
              <div className="h-[83px] rounded-md bg-neutral-950" />
              <div className="h-[83px] rounded-md bg-neutral-950" />
            </div>
            <div className="mt-6 h-10 rounded-md bg-neutral-100" />
          </div>
        )}
      </section>
    </main>
  );
}

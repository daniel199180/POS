import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";

export default function CatalogNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f2] px-5 text-[#172b32]">
      <div className="max-w-md text-center">
        <Store className="mx-auto size-12 text-[#4d8d72]" />
        <h1 className="mt-6 text-3xl font-semibold">Catálogo no disponible</h1>
        <p className="mt-3 text-[#657574]">
          La sucursal no existe o ya no está activa.
        </p>
        <Link
          href="/catalogo"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#14343d] px-5 py-3 text-sm font-semibold text-white"
        >
          <ArrowLeft className="size-4" /> Ver sucursales
        </Link>
      </div>
    </main>
  );
}

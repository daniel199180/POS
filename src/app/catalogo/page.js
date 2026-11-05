export const metadata = {
  title: "Catálogo del POS",
  description:
    "Abre el enlace del catálogo de tu sucursal para ver sus productos disponibles.",
  robots: { index: false, follow: false },
};

export default function CatalogEntryPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f2] px-5 text-[#172b32]">
      <div className="max-w-md text-center">
        <img
          src="/api/public/catalog/logo"
          alt="Logo del POS"
          className="mx-auto size-20 object-contain"
        />
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">
          Catálogo por sucursal
        </h1>
        <p className="mt-4 leading-7 text-[#657574]">
          Abre el enlace de tu sucursal para consultar sus productos
          disponibles.
        </p>
      </div>
    </main>
  );
}

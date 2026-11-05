export default function CatalogNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f2] px-5 text-[#172b32]">
      <div className="max-w-md text-center">
        <img
          src="/api/public/catalog/logo"
          alt="Logo del POS"
          className="mx-auto size-16 object-contain"
        />
        <h1 className="mt-6 text-3xl font-semibold">Catálogo no disponible</h1>
        <p className="mt-3 text-[#657574]">
          La sucursal no existe o ya no está activa.
        </p>
      </div>
    </main>
  );
}

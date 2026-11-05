# Catálogos públicos por sucursal

- `/catalogo` muestra una indicación para abrir el enlace específico de la sucursal. No ofrece un selector de sucursales.
- `/catalogo/<código>` muestra únicamente los productos activos cuya sucursal de origen coincide y cuyo stock actual es mayor a cero. El código es el identificador público estable de la sucursal, por ejemplo `CBB`.
- Cada página muestra solo el nombre de su sucursal y el logo configurado en el POS. La ruta `/api/public/catalog/logo` entrega únicamente ese logo desde el bucket privado.
- El catálogo ofrece búsqueda, categorías y orden por precio. Lee Appwrite desde el servidor en cada visita; no crea una copia de productos ni publica el costo o la cantidad exacta.
- Las imágenes se sirven desde una ruta pública controlada que vuelve a comprobar sucursal, producto, stock y tipo de archivo antes de leer el bucket privado.
- En el administrador, cada sucursal física activa tiene un enlace para abrir su catálogo.

Los precios y la disponibilidad son de consulta. El catálogo no crea pedidos ni reserva inventario.

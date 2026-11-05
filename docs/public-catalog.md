# Catálogos públicos por sucursal

- `/catalogo` muestra las sucursales físicas activas (`CBB`, `SCZ` y `LPZ`), que son las sucursales donde el POS permite crear productos.
- `/catalogo/<código>` muestra únicamente los productos activos cuya sucursal de origen coincide y cuyo stock actual es mayor a cero. El código es el identificador público estable de la sucursal, por ejemplo `CBB`.
- El catálogo ofrece búsqueda, categorías y orden por precio. Lee Appwrite desde el servidor en cada visita; no crea una copia de productos ni publica el costo o la cantidad exacta.
- Las imágenes se sirven desde una ruta pública controlada que vuelve a comprobar sucursal, producto, stock y tipo de archivo antes de leer el bucket privado.
- En el administrador, cada sucursal activa tiene un enlace para abrir su catálogo.

Los precios y la disponibilidad son de consulta. El catálogo no crea pedidos ni reserva inventario.

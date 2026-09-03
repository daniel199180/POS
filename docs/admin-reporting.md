# Historial y analíticas

## Acceso

`/historial` y `/analiticas` se muestran únicamente a administradores. Las páginas verifican el rol en el servidor y las API `/api/pos/admin/history` y `/api/pos/admin/analytics` devuelven 403 a cajeros. Las respuestas no se almacenan en caché.

## Historial

La colección privada `audit_events` almacena el usuario autenticado, su nombre/rol en ese momento, entidad, acción, sucursal cuando corresponde y campos anteriores/nuevos. No tiene permisos de lectura/escritura para clientes. No existen endpoints para modificar o eliminar eventos.

Se registran altas, ediciones y desactivaciones de productos y sucursales, ajustes manuales y aumentos de inventario, y cambios de permisos para crear productos/subir inventario. Los campos admitidos se enumeran en `audit-writer.js`; no se registran contraseñas, cookies ni credenciales bancarias. Los cambios del catálogo son globales y no se atribuyen arbitrariamente a una sucursal.

La pestaña Movimientos de inventario permite consultar los movimientos existentes, incluidas salidas por venta y ajustes por anulación. Los movimientos antiguos muestran los nombres disponibles actualmente en el catálogo. El historial nuevo conserva nombres al momento del cambio y no reconstruye cambios anteriores.

Cada operación reserva un evento `pending` antes de modificar datos. Si falla esa reserva, no se realiza el cambio. La operación termina en `completed` o `failed`; si se interrumpe el proceso o falla la confirmación, el evento permanece `pending`. Como el SDK usado no ofrece transacciones para estas operaciones, un evento incompleto requiere revisar el estado actual: algunas escrituras pueden haberse aplicado. No se reintenta automáticamente una mutación exitosa por fallar su confirmación de auditoría.

Para preparar otro entorno:

```sh
node scripts/setup-database.js --only=audit_events
```

El esquema también está incluido en el bootstrap habitual. Si se configura `COL_AUDIT_EVENTS`, utilizar ese nombre en `--only`. Los endpoints actuales ejecutan los servicios en Next.js. Si se utilizan las Appwrite Functions independientes, sus despliegues deben actualizarse con las mismas versiones de los servicios para incluir la auditoría.

## Métricas

- Período de 1 a 366 días en horario de Bolivia (UTC−4); comparación contra los días inmediatamente anteriores de igual duración y con idénticos filtros.
- Ingresos: total de ventas `completed`; excluye `cancelled` y `refunded`. Las anulaciones se atribuyen a la fecha original de la venta, no a la fecha de anulación.
- Ticket promedio: ingresos / número de ventas completadas. Una venta mixta cuenta una sola vez.
- Categorías: productos, mensualidades, cobros personalizados y sin detalle. Las mensualidades antiguas se reconocen también por el prefijo `Mensualidad:`. No se infiere que un cobro personalizado sea una mensualidad.
- Las categorías reparten el total neto de la venta en centavos; si hubiera descuentos, se prorratean según el subtotal de los ítems. La parte faltante de un detalle incompleto queda sin clasificar. Las inconsistencias se indican en el reporte.
- Comparación por sucursal (incluidas inactivas o sin ventas), participación, medios de pago, actividad por cajero, productos con más ingresos y distribución horaria.
- Si el período anterior no tuvo ingresos/ventas, el crecimiento porcentual se muestra sin base de comparación, nunca como infinito.
- Se recorren todas las páginas consultadas. Una consulta con más de 50.000 documentos solicita reducir filtros y no muestra un total parcial como completo.

No se calcula utilidad/margen porque `sale_items` no guarda el costo histórico; tampoco mora, retención de estudiantes ni deuda del instituto. La información de mensualidades describe los cobros registrados en el POS.

## Verificación

`npm run test:reports` verifica autorización, fechas, paginación, ventas mixtas, redondeo, clasificación histórica, cancelaciones y comportamiento de auditoría ante fallos. `npm run build` valida las páginas y rutas.

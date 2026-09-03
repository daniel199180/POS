# Reservas de enlaces de pago

Los nuevos enlaces vencen cinco horas después de crearse. Crear un QR no renueva ese plazo. La creación del enlace y el descuento del stock disponible se confirman en una transacción de Appwrite; si falla un producto, no se reserva ninguno.

El campo JSON `items` admite el formato anterior (array) y el nuevo sobre `{ inventoryStatus, items }`. Los estados de inventario son `reserved`, `consumed` y `released`. Los enlaces anteriores sin reserva no devuelven unidades que nunca descontaron y mantienen su vencimiento original.

El pago registra la venta y sus detalles, y consume la reserva, en una misma transacción. No vuelve a descontar stock. Las operaciones concurrentes sobre un enlace entran en conflicto al confirmar la transacción y se pueden reintentar sin duplicar la devolución.

## Revisión automática

La Function privada `pos-payment-links-expire` se ejecuta cada minuto. Consulta los QRs pendientes, registra los pagos confirmados y cancela los impagos vencidos antes de devolver stock. También se concilia al abrir/consultar/cancelar un enlace.

El proveedor actual recibe una fecha de vencimiento por día; el límite horario se aplica en el POS y mediante cancelación programada. El enlace deja de mostrar el QR a las cinco horas. La cancelación bancaria y devolución suceden en la siguiente revisión, normalmente dentro del siguiente minuto. Ante un error o respuesta ambigua del banco, se conserva la reserva y se reintenta: no se libera inventario de un posible pago recibido. Los errores quedan en las ejecuciones de Appwrite.

La conciliación interna permite revisar comprobantes firmados antiguos después de una interrupción prolongada; no omite la firma, la validación del monto ni la consulta bancaria. Las rutas normales del POS mantienen la caducidad de sus comprobantes.

## Despliegue y pruebas

```sh
REGISTER_FUNCTIONS=pos-payment-links-expire npm run register:functions
DEPLOY_FUNCTIONS=pos-payment-links-expire,pos-sales npm run deploy:functions
npm run test:payment-links
npm run build
```

Se necesita un servidor Appwrite con transacciones (verificado en 1.8.1). El adaptador conserva el SDK 18 instalado. La función no concede permisos de ejecución al público ni a cajeros. No se necesita una nueva colección ni cambiar permisos del logo: su ruta pública valida un token de enlace y sirve únicamente el logo institucional.

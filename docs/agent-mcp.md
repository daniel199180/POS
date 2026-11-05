# Reporte diario para agentes

La aplicación expone un MCP de solo lectura en `/api/mcp` y una ruta JSON equivalente en `/api/agent/daily-report`. Ambas requieren el encabezado:

```text
Authorization: Bearer <AGENT_REPORT_TOKEN>
```

Configura `AGENT_REPORT_TOKEN` con un valor largo y aleatorio en el entorno del servidor. No lo expongas en el navegador ni lo incluyas en el repositorio.

Los superadministradores pueden administrar el MCP desde `Configuraciones` en
el POS. Desde allí pueden activarlo, desactivarlo y generar o rotar el token.
El token se cifra antes de guardarse en la colección privada `mcp_settings` y
se muestra completo únicamente después de generarlo, para copiarlo una sola
vez.

La herramienta MCP `daily_income_report` acepta una fecha opcional en formato `YYYY-MM-DD`. Si se omite, usa el día actual de Bolivia (`America/La_Paz`). Devuelve los ingresos en BOB por sucursal, total de ventas, efectivo, QR, tarjeta, productos/materiales, mensualidades, cobros personalizados y productos cuyo stock está en o por debajo de su mínimo.

## Herramientas de inventario

El mismo token habilita estas consultas de solo lectura:

| Herramienta                  | Parámetros opcionales                                                                                                                | Resultado                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inventory_stock`            | `branchId`, `search` (nombre, SKU o código de barras), `status` (`all`, `in_stock`, `low_stock`, `out_of_stock`), `page`, `pageSize` | Existencias actuales de productos activos, con cantidad, mínimo, máximo, costo, precio y estado. Devuelve hasta 100 filas por página y el total de coincidencias.                                      |
| `inventory_report`           | `branchId`                                                                                                                           | Conteo completo de productos por estado y sucursal, valor conocido al costo y hasta 100 alertas de stock bajo o agotado. `alerts.truncated` indica si hay más; usa `inventory_stock` para recorrerlas. |
| `inventory_movements_report` | `dateFrom`, `dateTo`, `branchId`, `productId`, `page`, `pageSize`                                                                    | Conteos completos de entradas, salidas, ajustes y transferencias, por sucursal, más movimientos paginados. Por defecto cubre los últimos 30 días; acepta períodos de hasta 366 días.                   |

Las fechas son locales a la zona horaria configurada en el POS. `branchId` y `productId` son identificadores internos; `inventory_stock` devuelve los identificadores de producto y sucursal. Los reportes actuales respetan la sucursal de origen del producto; los movimientos son eventos históricos. Si falta el costo de un producto, queda fuera de `knownCostValue` y se cuenta en `productsWithoutCost`. Las cantidades de unidades distintas no se suman entre productos.

Ejemplo de configuración para un agente compatible con MCP:

```json
{
  "mcpServers": {
    "pos": {
      "url": "https://tu-dominio.example/api/mcp",
      "headers": {
        "Authorization": "Bearer ${AGENT_REPORT_TOKEN}"
      }
    }
  }
}
```

La herramienta está pensada para generar un reporte diario programado. El horario de ejecución lo define el agente o el automatizador que consuma este MCP.

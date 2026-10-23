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

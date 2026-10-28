# 2026-10-28 · Roles y permisos dinámicos — fase 5 (lo que faltaba conectar)

Estado al empezar: `permisos.motor = sombra`, 0 discrepancias. El retiro del
sistema viejo **no** se hizo: queda documentado para cuando el usuario pase a
`nuevo` y lo confirme (ver «Retiro del sistema viejo» en `docs/permisos.md`).

**Hecho.**

- **MCP y Data API** (`src/lib/external/acceso.ts`):
  - `accesoDeUsuario` (OAuth) usa la misma fuente que el proxy y el servidor.
  - `accesoDeTipo` (llaves `sk_live_…`) lee `roles`/`rol_permisos` en modo
    `nuevo` y `user_types` antes, con las mismas claves.
  - Verificado contra la base real: los 45 usuarios y los 15 tipos ven
    exactamente los mismos recursos que antes.
- **Seguridad:**
  - `POST /api/auth/evento`: con sesión, el correo de la bitácora es el de la
    sesión, no el que manda el navegador. Sin sesión queda marcado
    `email_declarado_sin_sesion`.
  - `GET /api/departments`: exige sesión y `vacantes.ver`, `empleados.ver` o
    `configuracion.ver`.
- **Botones según permiso:**
  - Detalle de empleado: editar, subir documento, retirar/reactivar,
    novedades, descargos y observaciones.
  - Detalle de candidato: avanzar etapa, contratar, editar, notas.
  - Acciones por fila del pipeline.
  - Tablero: arrastrar de etapa exige `candidatos.editar`.

**Pruebas.** `test:permisos` 55, `test:mcp` 8 y demás suites; `tsc`, `eslint`
y `build` pasan.

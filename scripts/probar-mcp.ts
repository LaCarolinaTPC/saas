// Prueba de humo del servidor MCP de Gestivo con el cliente oficial del SDK.
//
//   GESTIVO_MCP_URL=https://<gestivo>/api/mcp GESTIVO_API_KEY=sk_live_... npm run mcp:probar
//
// Sin GESTIVO_MCP_URL usa http://localhost:3000/api/mcp. Recorre las
// herramientas en el orden en que las usaría un agente y falla con salida 1 si
// alguna responde con error.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.GESTIVO_MCP_URL ?? "http://localhost:3000/api/mcp";
const clave = process.env.GESTIVO_API_KEY;
const soloSinBase = process.env.GESTIVO_MCP_SIN_BASE === "1";

if (!clave) {
  console.error("Defina GESTIVO_API_KEY con una clave sk_live_ de Configuración → API.");
  process.exit(1);
}

type Resultado = { content: { type: string; text?: string }[]; isError?: boolean };

async function main() {
  // 1) Sin credencial debe responder 401 con el puntero a los metadatos OAuth.
  const anonimo = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const wwwAuth = anonimo.headers.get("www-authenticate") ?? "";
  console.log(`Sin credencial → ${anonimo.status} ${wwwAuth ? "(WWW-Authenticate presente)" : ""}`);
  if (anonimo.status !== 401 || !wwwAuth.includes("resource_metadata")) {
    throw new Error("El MCP debería responder 401 con WWW-Authenticate y resource_metadata.");
  }

  const cliente = new Client({ name: "prueba-gestivo", version: "1.0.0" });
  await cliente.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${clave}` } },
    })
  );
  console.log("Conectado:", cliente.getServerVersion());

  const { tools } = await cliente.listTools();
  console.log(`Herramientas (${tools.length}):`, tools.map((t) => t.name).join(", "));

  let fallos = 0;
  async function llamar(nombre: string, args: Record<string, unknown> = {}) {
    const r = (await cliente.callTool({ name: nombre, arguments: args })) as Resultado;
    const texto = r.content.map((c) => c.text ?? "").join("");
    const resumen = texto.length > 400 ? `${texto.slice(0, 400)}… (${texto.length} caracteres)` : texto;
    console.log(`\n${r.isError ? "✗" : "✓"} ${nombre} ${JSON.stringify(args)}\n  ${resumen}`);
    if (r.isError) fallos++;
    return texto;
  }

  const guia = await llamar("guia_gestivo");
  await llamar("glosario", { termino: "timbradas" });
  await llamar("describir_recurso", { recurso: "cierres_diariso" }).then(() => fallos--); // error esperado con sugerencia

  if (!soloSinBase) {
    await llamar("estado_de_los_datos");
    await llamar("describir_recurso", { recurso: "cierres_diarios" });
    await llamar("consultar_datos", { recurso: "conductores_con_grupo", limite: 3 });
    await llamar("agregar_datos", {
      recurso: "conductores_con_grupo",
      agrupar_por: [{ columna: "estado" }],
    });
    await llamar("agregar_datos", {
      recurso: "ausentismo",
      agrupar_por: [{ columna: "fecha_inicio", truncar: "mes" }],
      metricas: [{ funcion: "count" }, { funcion: "sum", columna: "dias_it_pagados" }],
      filtros: [{ columna: "fecha_inicio", operador: "gte", valor: "2026-01-01" }],
    });
    const busqueda = JSON.parse(await llamar("buscar_conductor", { texto: "maria", limite: 3 }));
    const cedula = busqueda.coincidencias?.[0]?.cedula;
    if (cedula) await llamar("obtener_registro", { recurso: "conductores_con_grupo", id: String(cedula) });

    // Copia del ERP MGX: cada bloque solo si el rol de la credencial ve esos
    // recursos (contabilidad_mgx y nomina_mgx se asignan por separado).
    const veContabilidad = guia.includes('"recurso":"mgx_v_co_movimientos"');
    const veNomina = guia.includes('"recurso":"mgx_v_rh_empleados"');
    if (!veContabilidad && !veNomina) {
      console.log("\n(El rol de esta credencial no ve MGX: se omiten sus pruebas.)");
    }
    if (veContabilidad && !veNomina) {
      // Un rol solo contable no debe ver la nómina.
      const r = await llamar("describir_recurso", { recurso: "mgx_v_no_nomina" });
      if (r.includes("no está disponible para el rol")) fallos--;
      else {
        console.log("✗ un rol sin nómina pudo describir mgx_v_no_nomina");
        fallos++;
      }
    }
    if (veContabilidad) {
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1).toISOString().slice(0, 10);
      await llamar("describir_recurso", { recurso: "mgx_v_co_movimientos" });
      await llamar("agregar_datos", {
        recurso: "mgx_v_co_movimientos",
        agrupar_por: [{ columna: "fecha", truncar: "mes" }],
        metricas: [{ funcion: "sum", columna: "debito" }, { funcion: "sum", columna: "credito" }],
        filtros: [{ columna: "fecha", operador: "gte", valor: desde }],
      });
      // Error esperado: los movimientos contables exigen filtro de fecha.
      await llamar("agregar_datos", { recurso: "mgx_v_co_movimientos" }).then(() => fallos--);
    }
    if (veNomina && !veContabilidad) {
      const r = await llamar("describir_recurso", { recurso: "mgx_v_co_movimientos" });
      if (r.includes("no está disponible para el rol")) fallos--;
      else {
        console.log("✗ un rol sin contabilidad pudo describir mgx_v_co_movimientos");
        fallos++;
      }
    }
    if (veNomina) {
      const empleados = JSON.parse(
        await llamar("consultar_datos", {
          recurso: "mgx_v_rh_empleados",
          limite: 3,
          filtros: [{ columna: "activo", operador: "eq", valor: true }],
        })
      );
      const columnas: string[] = empleados.consulta?.columnas ?? [];
      if (columnas.some((c) => ["sueldo", "telefonos", "correo", "direccion"].includes(c))) {
        console.log("✗ mgx_v_rh_empleados devolvió columnas sensibles sin pedirlas");
        fallos++;
      }
      const ide = empleados.filas?.[0]?.ide;
      if (ide !== undefined) await llamar("obtener_registro", { recurso: "mgx_v_rh_empleados", id: String(ide) });
    }
    if (veContabilidad || veNomina) await llamar("consultar_datos", { recurso: "mgx_v_estado", limite: 3 });
  }

  await cliente.close();
  if (fallos > 0) throw new Error(`${fallos} herramienta(s) respondieron con error.`);
  console.log("\nPrueba completa sin errores.");
}

main().catch((e) => {
  console.error("\nFALLÓ:", e instanceof Error ? e.message : e);
  process.exit(1);
});

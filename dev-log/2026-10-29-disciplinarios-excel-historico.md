# 2026-10-29 · Procesos disciplinarios: alineado al Excel de RRHH, filtros e histórico

## Qué

Se tomó el Excel de RRHH «PROCESOS DISCIPLINARIOS» (hojas 2025 y 2026) como
referencia para el módulo `/disciplinarios` y se preparó la carga de su
histórico.

**Campos nuevos** (formulario, registro y exportes): cargo, área (operativa /
administrativa), norma incumplida (CST, seguridad vial, funciones /
obligaciones, comportamiento, reglamento, otra) y «realizado por» (persona,
con autocompletado de los ya usados). Al elegir un conductor del maestro, el
cargo y el área se llenan como «Conductor-cobrador» / operativa.

**Motivos nuevos** del vocabulario del Excel: incumplimiento de funciones /
obligaciones, comportamiento inadecuado, conducir sin cinturón, usuario en el
estribo, cobro indebido de pasaje o viajes. Las claves anteriores no cambian.

**Medida «No registrada (histórico)»**: el Excel no siempre dice qué se
decidió («ACTA DE DESCARGO»). No se ofrece al registrar; un histórico la
conserva al editarse.

**Filtros**: además de fechas, tipo, motivo y búsqueda, un atajo por año y
«Más filtros» con norma, medida, estado (abiertos / cerrados), asistencia a
descargos, área, cargo, realizado por, origen (Gestivo / histórico) y
situación en el maestro (activo / retirado). La búsqueda también mira la
descripción, los descargos y el detalle de la medida. Los filtros viajan en la
URL y el Excel exportado lleva en la primera fila los filtros aplicados.

Las filas cargadas del Excel llevan la etiqueta «Histórico».

## Carga del histórico

```bash
npm run disciplinarios:historico -- "<ruta>/PROCESOS DISCIPLINARIOS ACTUAL.xlsx" --ensayo
npm run disciplinarios:historico -- "<ruta>/PROCESOS DISCIPLINARIOS ACTUAL.xlsx" --escribir
npm run disciplinarios:historico -- --reversar
```

El Excel no trae cédula: el nombre se empareja con `conductores`. Se cargan
los exactos, los probables (3+ palabras, tolerando una letra por palabra) y
los parciales de 2 palabras confirmados (el mismo conductor aparece en otra
fila con el nombre completo). Por decisión de RRHH, ambiguos y sin maestro
**no se cargan**; quedan en `no-cargadas.csv` y se pueden sumar escribiendo su
cédula en `trabajadores.csv` y pasándolo con `--equivalencias`.
`--incluir-parciales` carga además los parciales sin confirmar (revisarlos:
«CARLOS DE LEON» empata con LEON CASTRO JUAN CARLOS).

Ensayo contra el archivo del 2026-10-29: 588 filas, **360 a cargar** (326
llamados, 34 citaciones), 228 fuera (117 parciales sin confirmar, 59 sin
maestro, 47 ambiguos, 3 duplicados entre hojas, 2 sin fecha). 341 personas
distintas: 92 exactas, 53 probables, 126 parciales (58 confirmadas), 22
ambiguas, 48 sin maestro.

Tipo y medida salen de SANCIÓN APLICADA (o de OBSERVACIÓN si está vacía);
motivo y norma, del texto de FALTA y OBSERVACIÓN (se usan al revés entre
hojas). El texto original queda en la descripción. Fechas con errores de
tipeo se corrigen con aviso (`avisos.csv`).

## Archivos

- Migración `20261029154740_procesos_disciplinarios_campos_del_excel_e_historico.sql`
  (columnas `cargo`, `area`, `realizado_por`, `norma_incumplida`, `origen`,
  `historico_ref`; medida `no_registrada`). Pendiente de aplicar a mano.
- `src/lib/disciplinarios/reglas.ts`: catálogos, campos, `filtrarProcesos`
  y filtros de la URL (+ test).
- `src/lib/disciplinarios/historico.ts`: lectura de la hoja, fechas, sanción,
  motivo, norma y emparejador de nombres (+ test, en `test:disciplinarios`).
- `scripts/migrar-disciplinarios-historico.mts` (`npm run disciplinarios:historico`).
- `src/app/(dashboard)/disciplinarios/`: formulario, filtros, registro y exportes.

# Buscador global

Se abre con `Ctrl+K` (`⌘K` en Mac), con el botón del menú lateral o con el de la
barra superior. Encuentra opciones del menú, pestañas y pantallas internas, y
registros: conductores, empleados, candidatos, vacantes, vehículos, accidentes,
incapacidades y procesos disciplinarios.

## Qué se actualiza solo

| Cambio | Qué pasa |
|---|---|
| Opción nueva o quitada en `NAV_TREE` | Entra o sale en el siguiente `npm run dev` o `npm run build` |
| `page.tsx` estático nuevo o borrado | Igual: `prebuild` y `predev` regeneran `pantallas.generated.json` |
| Cambio en el catálogo de permisos | Se aplica sin tocar el buscador |
| Registro creado, editado o borrado | Al instante: se consulta la tabla viva, no hay índice aparte |
| Tipo de registro nuevo (una tabla nueva) | **Manual:** una entrada en `FUENTES` |

Para que una pantalla salga con buen nombre, ponga `titulo="…"` en su `PageHeader`.

## Permisos

Una sola regla, `rutaVisible` en `src/lib/buscador/pantallas.ts`, decide pantallas
y registros: si el usuario no puede abrir la ruta, no la ve. A diferencia de
`rutaPermitida`, una ruta sin dueño en el catálogo no se muestra.

- **Pantallas:** el layout manda al navegador solo las visibles para ese usuario.
- **Registros:** `POST /api/buscador` evalúa los permisos en cada petición y ni
  siquiera consulta las fuentes que el usuario no puede abrir. El proxy no revisa
  `/api/*`: la ruta exige la sesión por su cuenta.
- **Si una página pide más que su ruta**, agregue `exige` en `ajustes.ts`. El
  patrón `if (!perms.isAdmin)` se detecta solo.

## Cómo agregar una fuente

Una entrada en `FUENTES` (`src/lib/buscador/fuentes.ts`):

1. `columnas`: solo de **texto**. Una numérica o un enum hacen fallar la consulta;
   las numéricas van en `columnasNumero`.
2. `fichas`: la página real y una ruta de ejemplo. De ahí sale el permiso; no se
   declara aparte.
3. Nunca busque ni devuelva columnas sensibles (diagnóstico, descripciones): un
   resultado revela que la coincidencia existe. Plan Padrino y ausentismo están
   fuera a propósito, por sus restricciones por fila y sus datos de diagnóstico.

Las pruebas (`npm run test:buscador`) comprueban que la ficha exista y tenga dueño.

## Datos sensibles

Incapacidades y disciplinarios solo buscan y devuelven nombre, cédula o código.
Una búsqueda que encuentra incapacidades queda auditada igual que la bandeja de
consulta, con `auditarConsultaBandeja`.

El término viaja por POST para que no quede en la URL ni en los logs de Next. De
Next a Kong sí va en la URL de un GET, así que puede quedar en esos logs.

## Cómo busca

Sin migraciones ni extensiones. Por cada palabra hace un `imatch` con clases de
tildes, de modo que `munoz` encuentra `MUÑOZ`. Al estrenarlo, una consulta tardó
unos 100 ms por fuente. No tolera errores de digitación: eso requeriría `pg_trgm`.

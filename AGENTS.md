<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Migraciones de base de datos

Nunca cree una migración a mano ni le ponga un número secuencial. Use:

```bash
npm run migracion:nueva -- "descripcion del cambio"
```

La numeración a mano provocaba colisiones entre quienes trabajan en paralelo,
así que las migraciones nuevas llevan marca de tiempo. El verificador
(`npm run migracion:verificar`, el hook de pre-commit y CI) rechaza cualquier
prefijo repetido y avisa cuando aparece una secuencial nueva.

La instancia es autoalojada y las migraciones se aplican **a mano** en el SQL
Editor: el script debe correr entero de una sola vez, ser idempotente donde se
pueda, y conceder `GRANT` a `service_role` sobre cada tabla nueva que la
aplicación consulte, porque en esta instalación no se heredan.

Detalle completo en `docs/migraciones.md`.

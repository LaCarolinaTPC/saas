# Vehículo de Accidentabilidad: selección estricta y rutas verificadas por GEMA

## Cambio

El N.º interno, placa y ruta del vehículo propio ya no se pueden digitar ni editar manualmente. El reportante debe buscar y escoger un vehículo del maestro de GEMA; al elegirlo, los tres datos se guardan como una unidad. Puede usar **Cambiar** para volver al buscador.

Esto evita inconsistencias detectadas en el histórico: el inexistente N.º `903` fue escrito en siete accidentes (la placa `UYX584` corresponde al 972), cuatro placas tenían un dígito errado y hay accidentes cuyo bus no coincide con el despacho.

El formulario además consulta el viaje vigente de GEMA por conductor, fecha y hora. Usa la ruta del viaje —no la asignación actual del bus— y advierte, sin corregir automáticamente, si el bus seleccionado no coincide con el despachado.

## Corrección histórica aplicada

Se ejecutó:

```bash
npm run accidentes:rutas-gema -- --aplicar
```

- **995** rutas corregidas con coincidencia segura de conductor + bus + viaje vigente.
- Cada cambio dejó un evento de auditoría en `accidente_eventos`.
- **19** discrepancias de bus se dejaron intactas para revisión humana.
- **500** accidentes no tenían viaje que rodara en GEMA para cruzar; no se infirió ninguna ruta.

El comando sin `--aplicar` es simulacro y lista las discrepancias:

```bash
npm run accidentes:rutas-gema
```

# HU18 — Prueba de respaldo automático y restauración

Fecha: **12/11/2026**. Entorno: Windows, base PostgreSQL local, herramientas PostgreSQL 18. Se emplearon los datos ya existentes; no se borraron ni modificaron tablas de la aplicación.

## Procedimiento y resultado

1. `npm.cmd run backup:create`: creó copia custom y manifiesto desde una misma instantánea PostgreSQL. **Aprobado**.
2. `npm.cmd run backup:install`: registró `SIGES-SR-Respaldo-Diario`, diariamente a las 02:00, hora local. **Aprobado**.
3. `schtasks.exe /Run /TN SIGES-SR-Respaldo-Diario`: ejecutó la tarea fuera del proceso de prueba. La consulta del programador registró último resultado **0**, tarea habilitada y próxima ejecución **13/11/2026 02:00:00**. **Aprobado**.
4. `npm.cmd run backup:verify`: restauró la copia generada por la tarea en una base temporal nueva y comparó todas sus tablas con el manifiesto. **Aprobado**.
5. `npm.cmd run backup:status`: confirmó copia vigente, con antigüedad menor a 24 horas. **Aprobado**.

Resultado de la restauración de la copia automática:

```json
{
  "resultado": "APROBADO",
  "verificadoEn": "2026-11-12T13:06:00.781Z",
  "archivo": "siges-2026-11-12T13-05-39-277Z-1e018b04.dump",
  "sha256": "c351aea62e92b26fa0b9daca68be69092fcf93fcad4eccca06d81d9ce48443ac",
  "tablas": 22,
  "registros": 915,
  "comparacion": "Cantidad y huella de todas las filas por tabla: idénticas a la instantánea del respaldo.",
  "baseTemporal": "siges_restore_test_4c6e813ece0e46c3897416a0e3557514"
}
```

La base temporal se eliminó al terminar. Los `.dump`, manifiestos e informes completos permanecen en `backups/`, excluido de Git. Esta evidencia contiene únicamente metadatos, sin nombres de pacientes, contraseñas ni contenido clínico.

## Alcance y límites

La comparación verifica cantidades y huellas del contenido completo de las 22 tablas, no solo que el archivo exista. La restauración reconstruye las restricciones e índices sin omitir errores. La instantánea permite comparar aun cuando la aplicación siga recibiendo cambios después de iniciar la copia.

Durante la preparación se detectó la incompatibilidad de `transaction_timeout` del cliente 18 con el servidor y la necesidad de incluir `btree_gist`; se corrigieron ambas y se generó una nueva copia antes de registrar este resultado.

El objetivo de pérdida máxima de 24 horas requiere ejecución diaria exitosa y equipo disponible. La tarea instalada necesita sesión interactiva de Windows y PostgreSQL accesible. Debe revisarse `backup:status` y el historial del programador; un equipo apagado o un fallo de almacenamiento no quedan resueltos por esta copia local. La aceptación final de HU18 sigue sujeta a revisión por PR y la Definition of Done del equipo.

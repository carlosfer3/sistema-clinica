# Catálogo CIE-10 reproducible

Se incorpora una instantánea de **15.037 categorías y subcategorías** del buscador público de la Oficina de Informática, Telecomunicaciones y Estadística de RIS Chota. Su página identifica como fuente la clasificación MINSA y enlaza las publicaciones de REUNIS:

- Publicación: https://oite.rischota.gob.pe/modulos/codigos.php
- Consulta pública: https://oite.rischota.gob.pe/modulos/php/llenarcodigos.php
- Referencia MINSA: https://www.minsa.gob.pe/reunis/?niv=1&op=3

La descarga directa del Excel de MINSA devolvió 403 en este entorno. Se utilizó el buscador oficial de RIS Chota; no un catálogo inventado ni una lista de diagnósticos de pacientes.

## Preparación y carga

Desde `apps/api`, `npm.cmd run db:seed:cie10` carga la instantánea versionada sin depender de Internet. Es transaccional e idempotente: conserva descripciones ya existentes y no borra códigos ni modifica diagnósticos históricos. Se verificaron una carga inicial de 15.037 entradas y una segunda carga sin inserciones.

Los archivos están en `prisma/catalog/`: `cie10-ris-chota.json` contiene los códigos y `cie10-source.json` la fecha, fuente, SHA-256 y trazabilidad de los 260 tramos consultados. `scripts/prepare-cie10.mjs` permite repetir la extracción explícitamente; la aplicación y CI no descargan fuentes externas al arrancar.

La consulta sin filtro se limita a 5.000 filas. Por eso la extracción consulta prefijos A0–Z9 y rechaza cualquier tramo que alcance el límite de búsqueda de 1.000 filas. Se normaliza `A001` a `A00.1`, sin cambiar la descripción publicada. Los duplicados contradictorios, formatos desconocidos o descripciones demasiado largas detienen la preparación. El importador verifica SHA-256, cobertura mínima y unicidad antes de escribir.

## Uso y alcance

El buscador médico `/api/consultations/diagnoses` consulta por código o descripción y devuelve hasta 50 resultados. La consulta final solo acepta códigos existentes y conserva una copia de la descripción en cada diagnóstico registrado.

Esta es una instantánea del catálogo público consultado el 12/11/2026, no una certificación de vigencia normativa de todos sus códigos. La página fuente también diferencia las publicaciones de uso y cese de códigos de la RM 447-2024. La selección de la edición y la validación de códigos vigentes para uso clínico real corresponden al responsable clínico. No se sustituye CIE-10 por CIE-10-ES, ICD-10-CM ni CIE-11. Los datos originales quedan trazados para poder actualizar la carga mediante un proceso revisado.

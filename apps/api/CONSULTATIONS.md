# HU08: consultas y receta manual

## Alcance implementado

API de registro final de consulta presencial para una cita del día actual en `America/Lima`, asignada al médico autenticado y con llegada, preparación completada y evaluación de enfermería existentes. No hay borradores, edición de recetas, consultas sin cita, interfaz médica ni HCE cronológica completa en este incremento. Los medicamentos se escriben manualmente; no hay catálogo ni autocompletado de medicamentos.

## Preparación local

Detener la API antes de regenerar Prisma en Windows si su DLL está en uso. Desde `apps/api`:

```powershell
npm.cmd run prisma:generate
npm.cmd run db:migrate
npm.cmd run db:seed:cie10:demo
npm.cmd run start:dev
```

La nueva migración es `20261108000300_consultations_prescriptions`. El seed CIE-10 es independiente del seed de usuarios y horarios, idempotente, transaccional, conserva descripciones existentes y rechaza `NODE_ENV=production`. Solo carga **J00 y Z00.0** como subconjunto de demostración; no es el catálogo completo ni una selección automática de diagnósticos. Referencias de los códigos: [CIE-10 OMS](https://icd.who.int/browse10/2019/en), [J00 en OPS](https://www.paho.org/sites/default/files/2022-04/REVELAC-Generic-Protocol-COVID-19_vaccine_effectiveness_e.pdf) y [Z00.0 en NHS](https://classbrowser.nhs.uk/ICD-10-5TH-Edition/vol1/block-z00-z13.htm). El catálogo completo y su proceso de carga quedan pendientes.

Preparar una cita para hoy mediante admisión y registrar sus signos vitales con enfermería. Autenticarse después como el médico asignado (`demo.medico` u otra cuenta médica correspondiente). Todas las rutas siguientes requieren Bearer JWT de médico; admisión y enfermería reciben 403.

## Rutas

| Método y ruta | Resultado |
| :--- | :--- |
| `GET /api/consultations/diagnoses?q=J00` | Código o descripción, sin distinción de mayúsculas; hasta 50 entradas ordenadas por código. Sin `q` devuelve las primeras 50. La consulta se audita como `READ_CIE10`. |
| `POST /api/consultations` | 201: guarda consulta, diagnósticos y receta opcional; marca la cita como `atendida`. |
| `GET /api/consultations/:id` | 200: consulta con diagnósticos y medicamentos ordenados, exclusivamente para su médico autor. Conserva episodios anulados y su evidencia. |

La documentación completa está en `/api/docs`, `/api/openapi.json` y `/api/openapi.yaml`.

Ejemplo de cuerpo con textos ficticios, sin indicaciones de tratamiento real; reemplazar `citaId` por la cita preparada y usar los códigos del catálogo local:

```json
{
  "citaId": 1,
  "motivo": "Motivo de consulta ficticio",
  "indicaciones": "Indicaciones generales ficticias",
  "diagnosticos": [{ "codigo": "J00" }],
  "receta": [
    {
      "medicamento": "Medicamento ficticio",
      "dosis": "Dosis ficticia",
      "via": "Vía ficticia",
      "frecuencia": "Frecuencia ficticia",
      "duracion": "Duración ficticia",
      "indicaciones": "Indicación adicional ficticia"
    }
  ]
}
```

`motivo` (máximo 300) e `indicaciones` (máximo 5000) son obligatorios y no pueden contener solo espacios. Se aceptan de 1 a 20 diagnósticos sin códigos repetidos: el primero es principal y los demás secundarios. Los códigos se validan contra `cie10`; una forma correcta no basta si el código no está cargado. La descripción se copia al diagnóstico para conservar lo registrado aunque cambie el catálogo.

Omitir `receta`, enviar `[]` o `null` permite una consulta sin medicamentos. Se aceptan hasta 30 elementos; cada uno requiere nombre (150), dosis (100), vía (80), frecuencia (100) y duración (100), como texto no vacío. Las indicaciones adicionales por medicamento son opcionales (500). Los números entre paréntesis son longitudes máximas. Cada elemento conserva su orden y texto original, preparado para asociar un catálogo en otra versión sin perder recetas previas.

Paciente, médico y fecha se determinan mediante cita y sesión. Se rechazan campos desconocidos, incluso en los elementos anidados. La respuesta usa `recetaItems`, además de `diagnosticos`, y los identificadores y datos de la consulta.

## Integridad y errores

Una transacción bloquea la cita, comprueba médico/estado/preparación, valida CIE-10, inserta consulta y detalles, cambia la cita a atendida y registra `CREATE_CONSULTATION`. Si falla la auditoría, todo se revierte. Dos registros concurrentes para la misma cita producen exactamente 201 y 409, sin duplicar receta.

400: cuerpo o código inválido, campos desconocidos o cita de otro día. 401: sesión inválida/inactiva. 403: rol no autorizado. 404: cita o consulta no accesible para ese médico (no revela registros ajenos). 409: cita no preparada, virtual, cancelada, atendida o con consulta previa. Una repetición de la creación no sobrescribe: devuelve 409. Ante un resultado incierto, comprobar el episodio antes de volver a intentar.

Consulta y detalles no se editan ni se borran físicamente. Los triggers preservan motivo, indicaciones, fecha, paciente/médico y elementos de diagnóstico/receta; permiten la anulación sustentada del episodio conforme a las restricciones existentes. El endpoint de anulación de HU09 y las correcciones versionadas todavía no están implementados. `READ_CONSULTATION` se registra antes de devolver información; si falla la auditoría no se entrega la consulta.

## Verificación

- `npm.cmd run build` y `npm.cmd run lint`.
- `npm.cmd run test:e2e`: permisos, DTO anidados, receta opcional/múltiple, CIE-10, precondiciones, propiedad médica, errores y Swagger; persistencia simulada.
- `npm.cmd run test:db`: aplica todas las migraciones en esquemas temporales. Incluye receta real en PostgreSQL, médico ajeno, conservación de datos, concurrencia 201/409, reversión completa ante fallo de auditoría y seed idempotente. No modifica las tablas del esquema de la aplicación.

# Registro de pruebas — SIGES SR

## Propósito y criterio de documentación

Registrar qué requisito se comprobó, con qué pasos y datos, qué se esperaba y qué ocurrió. Se adopta un formato ligero de casos y resultados inspirado en las definiciones de [caso de prueba de ISTQB](https://glossary.istqb.org/en_US/term/test-case) y los [conceptos de pruebas de ISO/IEC/IEEE 29119-1](https://www.iso.org/obp/ui/#iso:std:iso-iec-ieee:29119:-1:ed-2:v1:en). Este registro no constituye una declaración de conformidad con toda la norma.

Las capturas son evidencia complementaria. Deben acompañar un caso reproducible y mostrar método, URL, cuerpo ficticio enviado, código HTTP y respuesta. Ocultar contraseñas, tokens y el encabezado Authorization. No guardar datos reales de pacientes.

## Entorno y versión

- Pruebas automatizadas registradas: 28/10/2026, zona `America/Lima`.
- Pruebas manuales en Bruno: 30/10/2026, entre las 00:30 y las 01:14 aproximadamente, zona `America/Lima`, según lo confirmado por el ejecutor. Ejecutor: **Carlos Fernandez**. Los casos se realizaron de manera secuencial; el intervalo corresponde a la sesión completa y no se registraron horas individuales por caso.
- Versión de horarios médicos: commit `5e6a4f8`.
- API NestJS local: `http://localhost:3000/api`.
- PostgreSQL 16 en Docker, puerto local 5433, base `clinica_san_rafael`.
- Herramienta manual: **Bruno**, última versión disponible según lo informado por el ejecutor; número de versión no registrado.
- Automatización: Vitest y Prisma; esquema temporal independiente de los datos habituales.

## Qué se puede concluir

El login exitoso demuestra autenticación básica. Una búsqueda HTTP exitosa demuestra la consulta de pacientes. Ninguna de esas operaciones demuestra todavía el agendamiento de HU01.

La primera parte de HU01 implementa **persistencia de consultorios y horarios semanales**; sus restricciones se comprueban con pruebas automatizadas de PostgreSQL. Aún faltan endpoints de disponibilidad y reserva, además de interfaz, para demostrar la historia completa.

## Casos manuales en Bruno

Precondiciones comunes: Docker y API activos; cuentas ficticias disponibles. Utilizar `DEMO_PASSWORD` del `.env` local, sin copiarla a este documento. No hay endpoint de autorregistro de cuentas: `POST /patients` registra un paciente.

| ID | Referencia | Acción y datos | Resultado esperado | Resultado observado | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| API-001 | Base técnica | `GET /api`, sin cuerpo | 200 y `Hello World!` | 200 OK y `Hello World!` | Conforme |
| AUTH-001 | HU17 | `POST /api/auth/login`, JSON con `username=demo.admision` y contraseña local | 200, `accessToken` y `tokenType=Bearer` | 200 OK, campo `accessToken` oculto y `tokenType=Bearer` | Conforme |
| PAC-001 | HU07 | `GET /api/patients?q=Prueba`; Body=None; Auth=Bearer con token válido | 200 y arreglo de resultados, o `[]` | 200 OK y `[]`, sin coincidencias | Conforme |
| VAL-001 | Validación de pacientes | `POST /api/patients` con token de admisión y cuerpo de login (`username`, `password`) | 400; rechaza campos ajenos y señala datos de paciente faltantes | 400 Bad Request; rechaza `username` y `password` e informa campos de paciente faltantes | Conforme como caso negativo |
| AUTH-002 | HU17 | `GET /api/patients?q=Prueba`, sin token ni cuerpo | 401 | 401 Unauthorized, sin datos de pacientes | Conforme como caso negativo |
| RBAC-001 | HU17 | `GET /api/patients/1/clinical-profile` con token de admisión | 403, sin datos clínicos | 403 Forbidden, sin datos clínicos | Conforme como caso negativo |

Los seis casos tienen capturas de Bruno adjuntas y sus resultados fueron revisados contra los archivos guardados; esta revisión no constituye una nueva ejecución de las peticiones. Los códigos 400, 401 y 403 son resultados conformes cuando el rechazo es lo esperado. La búsqueda vacía de PAC-001 comprueba la consulta sin coincidencias, pero no demuestra la recuperación de un paciente existente.

### Evidencias manuales del 30/10/2026

| Caso | Captura | Respuesta guardada |
| :--- | :--- | :--- |
| API-001 | [Captura](evidencias/API-001-30_10_26.png) | Visible en la captura: `Hello World!` |
| AUTH-001 | [Captura con contraseña y token ocultos](evidencias/AUTH-001-30_10_26.png) | Sin JSON adjunto para evitar exponer el token |
| PAC-001 | [Captura](evidencias/PAC-001-30_10_26.png) | [JSON](evidencias/PAC-001-30_10_26-response.json) |
| VAL-001 | [Captura](evidencias/VAL-001-30_10_26.png) | [JSON completo](evidencias/VAL-001-30_10_26-response.json) |
| AUTH-002 | [Captura](evidencias/AUTH-002-30_10_26.png) | [JSON](evidencias/AUTH-002-30_10_26-response.json) |
| RBAC-001 | [Captura](evidencias/RBAC-001-30_10_26.png) | [JSON](evidencias/RBAC-001-30_10_26-response.json) |

En RBAC-001, el rol de admisión corresponde al usuario indicado por el ejecutor en la conversación; la captura muestra el token enmascarado y el rechazo, sin revelar sus claims. La captura de VAL-001 no muestra el cuerpo enviado, pero la respuesta completa identifica los campos rechazados.

### Pasos del caso PAC-001

1. En Bruno seleccionar método **GET**.
2. Introducir `http://localhost:3000/api/patients?q=Prueba`.
3. Seleccionar **Body → None** para no reutilizar el JSON del login.
4. Seleccionar **Auth → Bearer Token** y usar el token del login.
5. Pulsar **Send**; comparar código y cuerpo con el resultado esperado.
6. Registrar fecha, ejecutor y resultado real. Adjuntar una captura con las credenciales ocultas si se requiere evidencia visual.

## Casos automatizados de HU01 — horarios

Fuente: `apps/api/test/integrity.db-spec.ts`. Cada ejecución crea un esquema temporal, aplica todas las migraciones y elimina únicamente ese esquema al terminar. No necesita iniciar la API manualmente.

| ID | Condición comprobada | Resultado esperado |
| :--- | :--- | :--- |
| HU01-HOR-001 | Guardar un bloque semanal sin duración explícita, bloques consecutivos y domingo | Duración por defecto de 20 minutos; horas conservadas; bloques aceptados |
| HU01-HOR-002 | Días 0/8, fin igual o anterior al inicio, segundos, fin 24:00 y duración nula/negativa o mayor al bloque | PostgreSQL rechaza cada dato inválido y no crea horarios |
| HU01-HOR-003 | Mismo médico en dos consultorios a la misma hora; dos médicos en el mismo consultorio | Rechazo de cruces; aceptación si ambos recursos son distintos |
| HU01-HOR-004 | Dos asignaciones simultáneas del mismo bloque semanal | Exactamente una operación aceptada y una rechazada |

### Ejecución y evidencia

Desde `apps/api`:

```powershell
npm.cmd run test:db -- --reporter=json --outputFile=../../entregables/semana-8/pruebas/evidencias/hu01-horarios-vitest.json
```

El [reporte JSON](evidencias/hu01-horarios-vitest.json) registra tiempos y resultados de los casos. La suite incluye también ocho casos de regresión de pacientes, citas y auditoría.

**Resultado verificado el 28/10/2026:** 12 pruebas ejecutadas, 12 aprobadas, 0 fallidas. Los cuatro casos HU01-HOR-001 a HU01-HOR-004 tienen estado `passed` en el reporte. Entorno de esta corrida: PowerShell en Windows, sobre commit `5e6a4f8`; posteriormente se añadieron este registro, las evidencias manuales y el enlace desde README. Esto no equivale a una revisión por otro integrante ni a la aceptación de HU01 completa.

Para probar por separado la seguridad y validación HTTP con persistencia simulada: `npm.cmd run test:e2e`. Esa suite no sustituye las pruebas contra PostgreSQL ni se considera una ejecución manual en Bruno.

## Cómo guardar nuevas evidencias

Usar `evidencias/<ID>-<fecha>.png` para capturas y `<ID>-<fecha>-response.json` para respuestas sin secretos, siguiendo los nombres actuales. No crear referencias a archivos hasta haberlos guardado. Actualmente hay seis capturas de Bruno, cuatro respuestas JSON manuales y un reporte automatizado. No guardar respuestas de login con tokens visibles.

Plantilla para cada nueva ejecución:

| Campo | Valor a completar |
| :--- | :--- |
| ID / requisito | Por ejemplo, PAC-001 / HU07 |
| Fecha, hora y ejecutor | Fecha real, zona horaria y nombre |
| Versión | Hash de commit y cambios locales relevantes |
| Precondiciones | Servicios activos, rol y datos ficticios necesarios |
| Pasos / entrada | Método, URL, cuerpo sin credenciales |
| Esperado | Código HTTP, datos o rechazo concreto |
| Observado | Código y respuesta realmente obtenidos |
| Estado | Conforme, fallido o bloqueado |
| Evidencia | Ruta de captura, respuesta o reporte existente |
| Incidencia | Descripción y referencia al defecto, si corresponde |

## Limitaciones de aceptación

Los horarios no tienen API HTTP ni gestión de excepciones por fecha. Las pruebas de horarios validan esta parte técnica, no el flujo completo de reserva. HU01 permanece pendiente hasta implementar y probar disponibilidad, reserva concurrente y la interfaz, además de cumplir la Definition of Done.



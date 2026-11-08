# Sistema de Gestión de la Clínica San Rafael — SIGES SR

[![Status](https://img.shields.io/badge/Status-Sprint%201%20In%20Progress%20(Implementation)-blue.svg)](#-estado-actual-del-proyecto)
[![Course](https://img.shields.io/badge/FIIS--UNI-SW705%20Taller%20de%20Software%20I-red.svg)](https://fiis.uni.edu.pe/)
[![Architecture](https://img.shields.io/badge/Architecture-Modular%20Monolith-green.svg)](#-arquitectura-y-stack-tecnol%C3%B3gico)
[![License](https://img.shields.io/badge/License-Academic-lightgrey.svg)](#)

Repositorio oficial del **Proyecto Integrador (Parte 1)** para el curso **Taller de Ingeniería de Software I (SW705)** — Facultad de Ingeniería Industrial y de Sistemas (FIIS), Universidad Nacional de Ingeniería (UNI).

---

## 👥 Equipo de Desarrollo (Equipo E)

| Integrante | Rol en el Proyecto | Responsabilidad Principal |
| :--- | :---: | :--- |
| **Jhostin Leonardo Rodríguez Neyra** | **Scrum Master** | Gestión ágil, facilitación de sprints, seguridad y auditoría (HU17). |
| **Rafael Olivos Gallardo** | **Product Owner** | Gestión del backlog, visión del producto, HCE unificada (HU03) y perfil de paciente. |
| **Carlos Benjamin Fernández Iquise** | **Developer** | Arquitectura técnica, base de datos, disponibilidad de agenda (HU01, HU05) y prototipos. |

* **Patrocinador:** Gerencia General, Clínica San Rafael S.A.C.
* **Product Owner de Referencia:** Docente del curso SW705.

---

## 📌 Descripción del Proyecto

**SIGES SR** es una plataforma clínico-administrativa orientada a resolver la fragmentación operativa y clínica de la **Clínica San Rafael S.A.C.** (San Borja, Lima). 

Actualmente, la clínica gestiona historias clínicas en papel y hojas de cálculo dispersas, con un ausentismo en citas del **18 %** por saturación telefónica, demoras de hasta 48 horas en entrega de resultados de laboratorio y reconciliaciones manuales de facturación con 5 EPS/aseguradoras. 

### Visión de la Solución
Integrar en un único sistema web la **Historia Clínica Electrónica (HCE)** unificada y una **Agenda Médica Multiespecialidad** con validación consolidada de disponibilidad, garantizando estricta trazabilidad médico-legal y cumplimiento de la **Ley N.° 29733 (Ley de Protección de Datos Personales)** mediante control de acceso por roles (RBAC) y borrado lógico inmutable.

---

## 📊 Estado Actual del Proyecto

```mermaid
gantt
    title Cronograma de Hitos y Estado de Desarrollo
    dateFormat YYYY-MM-DD
    section Entregable 1 - Ingenieria
    Semana 2 - Constitucion y Vision               :done, w2, 2026-09-10, 2026-09-17
    Semanas 3-4 - Requerimientos y Modelos UML     :done, w3, 2026-09-18, 2026-10-01
    Semanas 5-6 - Arquitectura y Prototipo UX-UI   :done, w5, 2026-10-02, 2026-10-15
    Semana 7 - Plan de Release y Sprint Backlog 1  :done, w7, 2026-10-16, 2026-10-23
    Semana 8 - Examen Parcial Sustentacion E1      :done, w8, 2026-10-24, 2026-10-31
    section Sprint 1 - Codigo Real
    Semanas 9-11 - Implementacion Nucleo M1 y M2   :active, w9, 2026-11-01, 2026-11-21
    section Sprint 2 - Expansion
    Semanas 12-14 - Modulos M3 M4 M5 y M6          :w12, 2026-11-22, 2026-12-12
    Semana 16 - Examen Final                       :w16, 2026-12-13, 2026-12-20
```

### 📍 Fase actual: **Sprint 1 en implementación (Semanas 9 a 11)**

**Estado revisado al 08/11/2026**, a partir del código y las evidencias disponibles. Según el cronograma, el equipo se encuentra en la semana 10. La documentación del Entregable 1 está disponible; su aprobación académica no está registrada.

El incremento actual permite a admisión iniciar sesión, buscar un paciente existente, consultar disponibilidad y confirmar una cita presencial desde la web. El Sprint 1 sigue abierto.

| Área | Implementado | Pendiente principal |
| :--- | :--- | :--- |
| Seguridad y auditoría (HU17) | Login JWT, control por roles, verificación de cuentas activas y auditoría. | Extender la cobertura a los módulos restantes y validar la DoD. |
| Pacientes y base de HCE (M1; HU06/HU07 parciales) | Registro, búsqueda, ficha demográfica, antecedentes y alergias por API. | Registro desde la web, interfaz clínica, CIE-10, recetas, signos vitales e HCE cronológica. |
| Agenda y citas (M2; HU01 parcial) | Horarios, catálogo, disponibilidad y reserva transaccional por API; reserva desde la web de admisión. | Listado, reprogramación, cancelación, administración de horarios, feriados y excepciones. |
| Laboratorio, facturación, reportes y portal (M3–M6) | Planificados para Sprint 2; sin módulos funcionales implementados. | Implementación y validación. |
| Infraestructura y entrega | Docker Compose para PostgreSQL y Redis; API y web locales. | Contenedores de aplicaciones, CI/CD, respaldo/restauración y Swagger. |

> **Alcance acordado de HU04/HU06/HU10:** admisión registra solo datos demográficos y de contacto; enfermería consulta pacientes con llegada registrada y captura signos vitales y observaciones, sin acceso al historial médico; el médico consulta la evaluación previa y la HCE. Las [historias actualizadas](entregables/semana-6/historias-usuario-update.md) incluyen los criterios. La API ya rechaza antecedentes y alergias en el alta de admisión y restringe el perfil clínico al médico; HU04 y HU10 siguen pendientes.

No se declara ninguna historia terminada hasta completar criterios de aceptación, revisión por PR y validación en contenedores conforme a la DoD. Los modelos de datos por sí solos no constituyen módulos funcionales completos.

* **✅ Documentación de Ingeniería Consolidada (aprobación académica pendiente de registrar):**
  * Requerimientos funcionales (RF01–RF13) y no funcionales (RNF01–RNF06) especificados con criterios de aceptación en Gherkin (`Dado/Cuando/Entonces`).
  * Arquitectura de software modelada bajo el estándar C4 (Contexto, Contenedores y Componentes).
  * Modelo de Base de Datos relacional normalizado con soporte DDL de borrado lógico (`ck_consulta_anulacion`), diagramas ER y scripts SQL.
  * Wireframes de agendamiento, alertas y HCE unificada.
* **Implementado en backend:** conexión Prisma, prefijo `/api`, validación de DTO, CORS configurable, login JWT, permisos por rol y auditoría explícita en servicios y guard. Registro de pacientes sin cuenta de portal, solo con datos demográficos y de contacto, búsqueda por documento o nombre y consulta de ficha. Los hashes nunca se devuelven en la API.
* **Integridad en PostgreSQL:** migraciones con anulación justificada, bloqueo de borrado físico de consultas, antecedentes y alergias, bitácora append-only y exclusión de horarios solapados por médico. Las restricciones SQL complementan el esquema Prisma.
* **Interfaz de admisión implementada:** acceso con cuenta de admisión, búsqueda y selección de pacientes, catálogo de especialidades/médicos, consulta de disponibilidad y confirmación de reserva. Maneja turnos ocupados (409) y pérdida de sesión (401). Ver [guía de la interfaz](apps/web/ADMISSION.md).
* **Pendiente:** interfaz clínica, registro de pacientes desde la web, listado/reprogramación/cancelación de citas, CIE-10/recetas/signos vitales/HCE cronológica, notificaciones, respaldo/restauración, Swagger y CI/CD. HU01 cuenta con horarios, disponibilidad y reserva por API y web. HU06, HU07 y HU17 tienen avance de backend; ninguna historia se considera terminada hasta cumplir toda la DoD, revisión por PR y validación en contenedores.

---

## 🧩 Módulos del Sistema y Plan de Release

| Módulo | Alcance | Prioridad | Sprint Asignado |
| :--- | :--- | :---: | :---: |
| **M1. Historia Clínica Electrónica (HCE)** | Paciente único, antecedentes, consultas CIE-10, recetas, signos vitales y visualización unificada. | Must | **Sprint 1** *(En desarrollo)* |
| **M2. Agenda y Citas Médicas** | Disponibilidad consolidada de médicos, agendamiento, reprogramación, cancelación y recordatorios. | Must | **Sprint 1** *(En desarrollo)* |
| **M3. Laboratorio e Imágenes** | Generación de órdenes médicas y registro/consulta de resultados digitales. | Should | **Sprint 2** |
| **M4. Facturación y Convenios** | Emisión de comprobantes, categorización por convenio (particular, EPS, SOAT) y copagos. | Should | **Sprint 2** |
| **M5. Reportes Gerenciales** | Ocupación de consultorios, tiempos de espera e indicadores de inasistencia. | Could | **Sprint 2** |
| **M6. Portal del Paciente** | Agendamiento autónomo en línea y vista de citas. | Could | **Sprint 2** |

---

## 🏛 Arquitectura y Stack Tecnológico

El sistema adopta una **Arquitectura en Capas con API REST Monolítica Modular**, priorizando transacciones **ACID** para evitar colisiones en citas médicas, asegurar la trazabilidad médico-legal y optimizar costos de infraestructura (ajustado a una sola sede y 8,000 pacientes).

```
                      +-----------------------------+
                      |      React + Vite SPA       |
                      |   (Personal Clínico/Portal) |
                      +--------------+--------------+
                                     |  HTTPS / REST
                                     v
                      +-----------------------------+
                      |        Nginx Reverse        |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |      NestJS Backend API     |
                      |  [RBAC Guard | Auditoría]   |
                      |  +-----------------------+  |
                      |  | M1 | M2 | M3 | M4 | M5|  |
                      |  +-----------------------+  |
                      +-------+-------------+-------+
                              |             |
                              v             v
                    +------------+    +------------+
                    | PostgreSQL |    |   Redis    |
                    | (Prisma)   |    |  (BullMQ)  |
                    +------------+    +------------+
```

### Tecnologías Principales:
* **Backend implementado:** Node.js, TypeScript, [NestJS](https://nestjs.com/), Prisma ORM, JWT, bcryptjs y class-validator.
* **Frontend:** React, Vite y Tailwind CSS, con interfaz de acceso y agenda para admisión.
* **Base de Datos & Cache:** PostgreSQL 16, Redis.
* **Pruebas:** Vitest y Supertest, incluyendo pruebas de migraciones en un esquema PostgreSQL temporal.
* **Infraestructura:** Docker Compose para PostgreSQL y Redis. La API y la web se ejecutan localmente.
* **Arquitectura objetivo (pendiente):** BullMQ, Nginx, Swagger, Lucide y GitHub Actions. El diagrama anterior representa el diseño objetivo.

---

## 📁 Estructura del Repositorio

```text
├── apps/
│   ├── api/             # NestJS, Prisma, autenticación, auditoría y pacientes
│   └── web/             # React + Vite + Tailwind, acceso y agenda de admisión
├── entregables/
│   ├── semana-2/       # Acta de constitución y documento de visión
│   ├── semana-3/       # Guía de requerimientos iniciales
│   ├── semana-4/       # Especificación ERS, PC1 y diagramas UML
│   ├── semana-5/       # Estilo arquitectónico y vistas física/lógica
│   ├── semana-6/       # Wireframes UX/UI (W01, W02, W03) y modelo relacional
│   ├── semana-7/       # Modelos C4, workspace Structurizr DSL y consolidado
│   └── semana-8/       # [DOCUMENTO PRINCIPAL] sprint-1.md (Entregable 1 completo)
├── README.md           # Ficha técnica y estado del proyecto
├── docker-compose.yml  # PostgreSQL 16 y Redis 7
└── .env.example        # Variables de infraestructura
```

> 📄 **Documentación completa de ingeniería:** Puedes consultar la memoria técnica integral en [entregables/semana-8/sprint-1.md](entregables/semana-8/sprint-1.md).

---

## Ejecución local

Requisitos: Node.js 24 LTS, npm y Docker Compose. En PowerShell usar `npm.cmd` si la política de scripts impide ejecutar `npm.ps1`. También se puede usar PostgreSQL 16 ya instalado.

Desde la raíz:

```powershell
Copy-Item .env.example .env
docker compose up -d
Copy-Item apps/api/.env.example apps/api/.env
```

Ajustar `DATABASE_URL` en `apps/api/.env` al usuario, contraseña y puerto de PostgreSQL. Generar un secreto con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` y asignarlo a `JWT_SECRET` (mínimo 32 caracteres). No versionar archivos `.env`. Si ya existen, conservarlos y agregar solo las variables faltantes.

Backend:

```powershell
cd apps/api
npm.cmd ci
npm.cmd run prisma:generate
npm.cmd run db:migrate
npm.cmd run start:dev
```

API: `http://localhost:3000/api`. `GET /api` conserva el saludo de ejemplo; no es una comprobación de salud de PostgreSQL. Para ejecutar el compilado: `npm.cmd run build` y `npm.cmd run start:prod`.

Frontend, en otra terminal:

```powershell
cd apps/web
npm.cmd ci
npm.cmd run dev
```

Abrir `http://localhost:5173`. `CORS_ORIGIN` debe coincidir con el origen de la web.

La web usa `VITE_API_URL` (por defecto `http://localhost:3000/api`); copiar `apps/web/.env.example` a `apps/web/.env.local` para cambiarla. Ingresar con una cuenta de admisión existente. El token permanece en memoria y se descarta al cerrar sesión o recargar. Consultar [la guía de admisión](apps/web/ADMISSION.md) para el flujo y sus límites.

### Cuentas ficticias de demostración

Desde `apps/api`, definir `DEMO_PASSWORD` en el entorno local (no versionado), con al menos 12 caracteres y hasta 72 bytes UTF-8, y ejecutar `npm.cmd run db:seed:demo` después de aplicar las migraciones. Crea `demo.admision`, `demo.medico`, `demo.medico.pediatria` y `demo.enfermeria` con hash bcrypt. Las cuentas nuevas usan esa contraseña; las existentes conservan su contraseña y sus datos.

La carga incluye dos especialidades, dos médicos asociados a sus cuentas, dos consultorios y cinco bloques semanales ficticios:

| Cuenta médica | Especialidad | Consultorio | Días | Horario local (`America/Lima`) | Duración |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `demo.medico` | Medicina General (DEMO) | Consultorio DEMO 1 | Lunes, miércoles y viernes | 08:00–12:00 | 20 minutos |
| `demo.medico.pediatria` | Pediatria (DEMO) | Consultorio DEMO 2 | Martes y jueves | 09:00–12:00 | 30 minutos |

Los códigos `DEMO0001` y `DEMO0002` son identificadores ficticios, no matrículas profesionales reales. Los horarios usan una fecha de referencia UTC para almacenar las horas locales sin desplazarlas. Se puede repetir el comando sin duplicar estos registros. Toda la carga es transaccional: si una cuenta tiene un rol incompatible o está inactiva, un consultorio está inactivo, un médico/horario existente difiere de la configuración esperada o PostgreSQL rechaza un cruce, se cancela la carga completa sin sobrescribir los datos existentes. Revisar el conflicto antes de volver a ejecutarla.

El seed rechaza `NODE_ENV=production`; verificar además que `DATABASE_URL` apunte al entorno de desarrollo antes de ejecutarlo. No crea pacientes ni citas: registrar pacientes mediante la API permite comprobar validaciones, permisos y auditoría. Estos datos alimentan el catálogo y la disponibilidad y permiten probar la reserva con pacientes registrados previamente por API. Las pruebas del seed se ejecutan con `npm.cmd run test:db` en un esquema temporal independiente.

### Contrato HTTP implementado

| Método y ruta | Permiso | Comportamiento |
| :--- | :--- | :--- |
| `POST /api/auth/login` | Público | `{ "username": "...", "password": "..." }`; devuelve `accessToken` (1 hora). |
| `GET /api/auth/me` | Cualquier rol autenticado | Devuelve exclusivamente el ID y rol actual de la cuenta activa. |
| `GET /api/agenda/catalog` | admision, medico, enfermeria | Especialidades con médicos activos de rol médico y al menos un horario en consultorio activo; nombres e IDs para los selectores de agenda. Registra `READ_AGENDA_CATALOG`. |
| `GET /api/agenda/availability?fecha=YYYY-MM-DD&especialidadId=1&medicoId=1` | admision, medico, enfermeria | Turnos futuros disponibles; `medicoId` es opcional. |
| `POST /api/agenda/appointments` | admision | Reserva transaccional con auditoría; conflicto de ocupación devuelve 409. |
| `POST /api/agenda/appointments/:id/arrival` | admision | Registra llegada de una cita presencial del día en Lima; no cambia su estado. |
| `POST /api/patients` | admision | Registra únicamente datos demográficos y de contacto; rechaza antecedentes y alergias con 400; documento duplicado devuelve 409 y `patientId`. |
| `GET /api/patients?q=texto&limit=20` | admision, medico, enfermeria | Busca por documento, nombres o apellidos; máximo 100 resultados; sin campos clínicos. |
| `GET /api/patients/:id` | admision, medico, enfermeria | Ficha demográfica. |
| `GET /api/patients/:id/clinical-profile` | medico | Ficha con antecedentes y alergias; todavía no es la HCE cronológica de HU03. |

Enviar `Authorization: Bearer <accessToken>` en rutas protegidas. Los usuarios inactivos pierden acceso aunque el token no haya expirado. Las rutas nuevas requieren declarar sus roles explícitamente. Las operaciones de pacientes registran auditoría; futuras rutas clínicas deberán integrar el mismo servicio. Si no se puede escribir auditoría, no se devuelve información del paciente.

Ejemplo de registro (solo datos ficticios):

```json
{
  "tipoDocumento": "DNI",
  "numeroDocumento": "87654321",
  "nombres": "Paciente Ficticio",
  "apellidos": "Prueba",
  "fechaNacimiento": "1990-01-01",
  "sexo": "F",
  "telefono": "999888777",
  "correo": "ficticio@example.test"
}
```

### Verificación

Las pruebas manuales de API se realizan con **Bruno**. Consultar el [registro de pruebas y evidencias](entregables/semana-8/pruebas/registro-pruebas.md), que conserva resultados manuales del 30/10/2026 y el reporte de horarios del 28/10/2026. Sus pendientes describen aquella versión: disponibilidad, reserva e interfaz ya existen en el código actual. Las evidencias históricas no certifican el flujo integrado actual.

Desde `apps/api`: `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:e2e` y `npm.cmd run test:db`. Las pruebas HTTP e2e usan persistencia simulada; `test:db` aplica todas las migraciones y prueba el flujo HTTP contra un esquema temporal único, que elimina al terminar. Requiere PostgreSQL y permisos para crear esquemas y la extensión `btree_gist`. No reinicia las tablas del esquema de la aplicación.

Desde `apps/web`: `npm.cmd run build`, `npm.cmd run lint` y `npm.cmd run test:e2e`. Las pruebas de navegador usan Microsoft Edge con API simulada y verifican acceso, reserva, colisiones, sesión, filtros y adaptación móvil; no sustituyen una ejecución integrada con PostgreSQL.

Las migraciones no corrigen datos históricos incompatibles: si ya existen citas solapadas o anulaciones incompletas, se debe revisar esos datos antes de desplegarlas. En despliegue usar un rol de aplicación sin permisos de superusuario ni DDL; los triggers no protegen frente al administrador de la base de datos.

### Comprobaciones de esta revisión (08/11/2026)

| Comprobación | Resultado |
| :--- | :--- |
| API: `npm.cmd test` | 1 prueba aprobada. |
| API: `npm.cmd run test:e2e` | 41 pruebas aprobadas en 4 archivos; persistencia simulada. |
| Web: `npm.cmd run build` | Compilación correcta. |
| Web: `npm.cmd run lint` | Sin errores. |

En esta revisión no se ejecutaron `test:db` ni Playwright, ni se verificó el flujo integrado con PostgreSQL. Los resultados anteriores no acreditan la aceptación completa de las historias.

### Alcance implementado de HU01 y siguientes pasos

Primera parte implementada: modelos `Consultorio` y `HorarioMedico`, con horarios semanales por médico y consultorio. Días ISO (1=lunes, 7=domingo), horas locales de `America/Lima` y duración configurable de 20 minutos por defecto. PostgreSQL rechaza cruces del mismo médico o consultorio, días inválidos, intervalos invertidos y duraciones que no caben. Los bloques adyacentes están permitidos. Horas en minutos completos, dentro del mismo día (00:00 a 23:59); sin vigencias, feriados ni excepciones por fecha todavía. Prisma representa las horas `TIME` mediante `Date` con fecha de referencia `1970-01-01` y componente horario UTC: no convertirlas usando la zona horaria del servidor.

El modelo permite bloques de varias citas; la consulta de disponibilidad genera únicamente turnos completos desde `horaInicio`, dejando fuera cualquier resto menor que `duracionCitaMin`. Los horarios aún no tienen endpoints de administración; el seed de demostración permite cargar bloques ficticios. La reserva por API valida que cada cita nueva coincida con un turno completo del horario; no modifica las citas anteriores.

Consulta implementada: `GET /api/agenda/availability?fecha=2026-11-09&especialidadId=1&medicoId=1`. Requiere Bearer JWT con rol `admision`, `medico` o `enfermeria`. `fecha` (YYYY-MM-DD válido) y `especialidadId` (entero positivo) son obligatorios; `medicoId` es opcional. Los IDs del ejemplo deben corresponder a los datos locales. Campos desconocidos o parámetros inválidos devuelven 400.

Devuelve `{ fecha, zonaHoraria: "America/Lima", especialidadId, turnos }`. Cada turno contiene `medicoId`, `medico: { nombres, apellidos }`, `consultorioId`, `consultorio`, `inicio` y `fin`. Los instantes se serializan en UTC (08:00 de Lima corresponde a 13:00Z). Solo incluye turnos completos futuros, de médicos activos con rol médico y consultorios activos. Excluye solapamientos con citas no canceladas, incluso si comienzan el día anterior. Los intervalos adyacentes se permiten. Sin coincidencias o con fecha pasada devuelve `turnos: []`. La lectura registra `READ_AVAILABILITY` y no expone pacientes ni detalles de citas.

La disponibilidad es informativa: no bloquea turnos y puede cambiar mientras otro usuario reserva. No contempla feriados ni excepciones por fecha. Las pruebas HTTP con persistencia simulada están en `apps/api/test/availability.e2e-spec.ts` y se ejecutan con `npm.cmd run test:e2e`; no constituyen evidencia de ejecución contra PostgreSQL real.

Reserva implementada: `POST /api/agenda/appointments`, exclusivamente para `admision` con Bearer JWT. Ejemplo (reemplazar IDs y fecha por datos locales y un turno futuro):

```json
{
  "pacienteId": 1,
  "medicoId": 1,
  "inicio": "2026-11-09T08:00:00-05:00",
  "motivo": "Control",
  "canalOrigen": "presencial"
}
```

`pacienteId`, `medicoId` e `inicio` son obligatorios. El inicio requiere zona explícita (`Z` o desplazamiento), segundos cero y debe coincidir con un turno completo futuro del horario de Lima. Se acepta el instante UTC equivalente que devuelve disponibilidad. `motivo` es opcional (hasta 300 caracteres); `canalOrigen` admite `presencial` (por defecto) o `telefono`. La duración se calcula en servidor desde el horario; el cliente no puede elegir fin, estado, creador ni modalidad. Esta ruta crea citas presenciales en estado `programada`.

Respuestas: 201 con ID, paciente/médico, inicio/fin UTC, estado, canal y modalidad; 400 para datos inválidos, turnos pasados o fuera de horario; 404 para paciente inexistente o médico inexistente/inactivo; 409 si una cita no cancelada ocupa total o parcialmente el intervalo. La transacción bloquea la fila del médico para serializar reservas entre procesos, vuelve a comprobar el solapamiento y guarda cita y auditoría `CREATE_CITA` juntas: si falla la auditoría, se revierte la reserva. La restricción de exclusión existente en PostgreSQL sigue protegiendo contra solapamientos. No se impide que un paciente tenga citas con médicos distintos a la misma hora.

Las pruebas de `apps/api/test/integrity.db-spec.ts` verifican dos reservas HTTP simultáneas (201/409), cancelación y nueva reserva, actualización de disponibilidad, validaciones y reversión por fallo de auditoría contra un esquema PostgreSQL temporal. Ejecutar `npm.cmd run test:db` con la base de desarrollo configurada.

Interfaz de admisión implementada: consultar disponibilidad, elegir un paciente existente y confirmar la reserva desde la web. Siguiente incremento: listado y gestión de citas (reprogramación/cancelación) y registro de pacientes desde la interfaz. Feriados y excepciones siguen pendientes. La aceptación de HU01 continúa sujeta a la DoD y revisión por PR.

---

## 🛠 Convención de Trabajo y Commits

El equipo sigue el estándar **[Conventional Commits](https://www.conventionalcommits.org/)** en idioma inglés:

* `docs(week-N): <descripcion>`: Cambios en documentación o especificaciones de ingeniería.
* `feat(<modulo>): <descripcion>`: Nueva funcionalidad de código.
* `fix(<modulo>): <descripcion>`: Corrección de errores.
* `test(<modulo>): <descripcion>`: Adición o refactorización de pruebas.

---

## ⚖️ Marco Legal y Normativo
* **Requisito del proyecto asociado a la Ley N.° 29733:** auditar lecturas y modificaciones clínicas, restringir el acceso por rol y conservar entradas mediante anulación sustentada. La implementación actual cubre autenticación y pacientes; el resto de la HCE y la revisión integral de cumplimiento siguen pendientes.

### Registro de llegada de pacientes

`POST /api/agenda/appointments/:id/arrival`, con token de admisión y sin campos en el cuerpo, registra la hora del servidor en `llegadaEn`. Solo admite citas presenciales del día actual en `America/Lima`, en estado `programada`, `confirmada` o `reprogramada`. Se permite registrar la llegada antes o después de la hora programada, dentro del mismo día.

Devuelve 200 con `{ id, estado, llegadaEn }`; 400 para ID/cuerpo inválido o cita de otro día, 404 para cita inexistente y 409 para modalidad o estado incompatible. Una repetición válida conserva la primera hora y no duplica auditoría. La actualización y `REGISTER_ARRIVAL` se guardan en una transacción con bloqueo de la cita; si falla la auditoría se revierte la llegada. La cita no pasa a `atendida`. El campo ya existe en las migraciones, sin cambios de esquema.

Este incremento implementa la API de llegada; la interfaz de admisión, el listado de pendientes de enfermería (HU04) y el registro de signos vitales (HU10) siguen pendientes.

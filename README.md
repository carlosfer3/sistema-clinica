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
    Semana 8 - Examen Parcial Sustentacion E1      :active, w8, 2026-10-24, 2026-10-31
    section Sprint 1 - Codigo Real
    Semanas 9-11 - Implementacion Nucleo M1 y M2   :w9, 2026-11-01, 2026-11-21
    section Sprint 2 - Expansion
    Semanas 12-14 - Modulos M3 M4 M5 y M6          :w12, 2026-11-22, 2026-12-12
    Semana 16 - Examen Final                       :w16, 2026-12-13, 2026-12-20
```

### 📍 Fase Actual: **Transición de Ingeniería hacia Código Real (Sprint 1)**
Nos encontramos en el **cierre del Entregable 1 (Semana 8)** y en el **arranque de la formalización e implementación del código fuente del Sprint 1 (Semanas 9 a 11)**:

* **✅ Documentación de Ingeniería Consolidada (aprobación académica pendiente de registrar):**
  * Requerimientos funcionales (RF01–RF13) y no funcionales (RNF01–RNF06) especificados con criterios de aceptación en Gherkin (`Dado/Cuando/Entonces`).
  * Arquitectura de software modelada bajo el estándar C4 (Contexto, Contenedores y Componentes).
  * Modelo de Base de Datos relacional normalizado con soporte DDL de borrado lógico (`ck_consulta_anulacion`), diagramas ER y scripts SQL.
  * Wireframes de agendamiento, alertas y HCE unificada.
* **Implementado en backend:** conexión Prisma, prefijo `/api`, validación de DTO, CORS configurable, login JWT, permisos por rol y auditoría explícita en servicios y guard. Registro de pacientes sin cuenta de portal, antecedentes/alergias, búsqueda por documento o nombre y consulta de ficha. Los hashes nunca se devuelven en la API.
* **Integridad en PostgreSQL:** migraciones con anulación justificada, bloqueo de borrado físico de consultas, antecedentes y alergias, bitácora append-only y exclusión de horarios solapados por médico. Las restricciones SQL complementan el esquema Prisma.
* **Pendiente:** interfaz clínica (el frontend aún muestra la plantilla), agenda HU01/HU05 y horarios de atención, CIE-10/recetas/signos vitales/HCE cronológica, notificaciones, respaldo/restauración, Swagger y CI/CD. HU06, HU07 y HU17 tienen avance de backend; ninguna historia se considera terminada hasta cumplir toda la DoD, revisión por PR y validación en contenedores.

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
* **Frontend inicializado:** React, Vite y Tailwind CSS.
* **Base de Datos & Cache:** PostgreSQL 16, Redis.
* **Pruebas:** Vitest y Supertest, incluyendo pruebas de migraciones en un esquema PostgreSQL temporal.
* **Infraestructura:** Docker Compose para PostgreSQL y Redis. La API y la web se ejecutan localmente.
* **Arquitectura objetivo (pendiente):** BullMQ, Nginx, Swagger, Lucide y GitHub Actions. El diagrama anterior representa el diseño objetivo.

---

## 📁 Estructura del Repositorio

```text
├── apps/
│   ├── api/             # NestJS, Prisma, autenticación, auditoría y pacientes
│   └── web/             # React + Vite + Tailwind (plantilla inicial)
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

### Cuentas ficticias de demostración

Desde `apps/api`, definir temporalmente `DEMO_PASSWORD` con una contraseña local de al menos 12 caracteres y ejecutar `npm.cmd run db:seed:demo`. Crea `demo.admision`, `demo.medico` y `demo.enfermeria` con hash bcrypt. No modifica cuentas ya existentes. El médico de demostración es una cuenta de acceso; todavía no crea un registro de médico ni horarios para agenda.

### Contrato HTTP inicial

| Método y ruta | Permiso | Comportamiento |
| :--- | :--- | :--- |
| `POST /api/auth/login` | Público | `{ "username": "...", "password": "..." }`; devuelve `accessToken` (1 hora). |
| `POST /api/patients` | admision | Registra datos, antecedentes y alergias; documento duplicado devuelve 409 y `patientId`. |
| `GET /api/patients?q=texto&limit=20` | admision, medico, enfermeria | Busca por documento, nombres o apellidos; máximo 100 resultados; sin campos clínicos. |
| `GET /api/patients/:id` | admision, medico, enfermeria | Ficha demográfica. |
| `GET /api/patients/:id/clinical-profile` | medico, enfermeria | Ficha con antecedentes y alergias; todavía no es la HCE cronológica de HU03. |

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
  "correo": "ficticio@example.test",
  "antecedentes": [{ "tipo": "cronica", "descripcion": "Antecedente ficticio" }],
  "alergias": [{ "sustancia": "Sustancia ficticia" }]
}
```

### Verificación

Desde `apps/api`: `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:e2e` y `npm.cmd run test:db`. Las pruebas HTTP e2e usan persistencia simulada; `test:db` aplica todas las migraciones y prueba el flujo HTTP contra un esquema temporal único, que elimina al terminar. Requiere PostgreSQL y permisos para crear esquemas y la extensión `btree_gist`. No reinicia las tablas del esquema de la aplicación.

Desde `apps/web`: `npm.cmd run build` y `npm.cmd run lint`.

Las migraciones no corrigen datos históricos incompatibles: si ya existen citas solapadas o anulaciones incompletas, se debe revisar esos datos antes de desplegarlas. En despliegue usar un rol de aplicación sin permisos de superusuario ni DDL; los triggers no protegen frente al administrador de la base de datos.

### Siguiente paso: HU01

Definir horarios laborales, duración de turnos y zona horaria `America/Lima`; agregar médicos/especialidades de prueba y una API de disponibilidad. Después implementar la reserva transaccional con respuesta 409 ante colisiones y su interfaz de admisión. La restricción de solapamientos ya existe; todavía no hay endpoints de citas.

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

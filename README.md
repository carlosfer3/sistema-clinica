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
    dateFormat  YYYY-MM-DD
    section Entregable 1 (Ingeniería)
    Semana 2 : Constitución y Visión               :done, w2, 2026-09-10, 2026-09-17
    Semanas 3-4 : Requerimientos y Modelos UML       :done, w3, 2026-09-18, 2026-10-01
    Semanas 5-6 : Arquitectura, BD y Prototipo UX/UI :done, w5, 2026-10-02, 2026-10-15
    Semana 7 : Plan de Release y Sprint Backlog 1    :done, w7, 2026-10-16, 2026-10-23
    Semana 8 : Examen Parcial (Sustentación E1)      :active, w8, 2026-10-24, 2026-10-31
    section Sprint 1 (Código Real)
    Semanas 9-11 : Implementación Núcleo M1 + M2     :w9, 2026-11-01, 2026-11-21
    section Sprint 2 (Expansión)
    Semanas 12-14 : Módulos M3, M4, M5 y M6          :w12, 2026-11-22, 2026-12-12
    Semana 16 : Examen Final (Producto Funcional)    :w16, 2026-12-13, 2026-12-20
```

### 📍 Fase Actual: **Transición de Ingeniería hacia Código Real (Sprint 1)**
Nos encontramos en el **cierre del Entregable 1 (Semana 8)** y en el **arranque de la formalización e implementación del código fuente del Sprint 1 (Semanas 9 a 11)**:

* **✅ Documentación de Ingeniería Aprobada y Consolidada:**
  * Requerimientos funcionales (RF01–RF13) y no funcionales (RNF01–RNF06) especificados con criterios de aceptación en Gherkin (`Dado/Cuando/Entonces`).
  * Arquitectura de software modelada bajo el estándar C4 (Contexto, Contenedores y Componentes).
  * Modelo de Base de Datos relacional normalizado con soporte DDL de borrado lógico (`ck_consulta_anulacion`), diagramas ER y scripts SQL.
  * Prototipos UX/UI navegables de agendamiento, alertas y HCE unificada.
* **🔨 En Proceso (Transición a Código - Sprint 1):**
  * **Estructura del Proyecto:** Inicialización del scaffolding backend en **NestJS** y frontend en **React + Vite**.
  * **Capa de Persistencia:** Mapeo de modelos en **Prisma ORM** y contenedor de **PostgreSQL** en Docker.
  * **Seguridad Transversal:** Implementación de Guards JWT para RBAC e interceptor de auditoría para la Ley 29733 (HU17).
  * **Lógica Núcleo en Construcción:**
    * M1: Registro de paciente único con validación de DNI (HU06) y atención de consulta médica (HU08).
    * M2: Agendamiento con validación de disponibilidad consolidada (HU01).

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
* **Backend:** Node.js, TypeScript, [NestJS](https://nestjs.com/), Prisma ORM, BullMQ (colas de mensajería), class-validator.
* **Frontend:** React, Vite, Tailwind CSS, Lucide Icons.
* **Base de Datos & Cache:** PostgreSQL 16, Redis.
* **Infraestructura & DevOps:** Docker, Docker Compose, Nginx, GitHub Actions (CI/CD con Jest y Supertest).

---

## 📁 Estructura del Repositorio

```text
├── entregables/
│   ├── semana-2/       # Acta de constitución y documento de visión
│   ├── semana-3/       # Guía de requerimientos iniciales
│   ├── semana-4/       # Especificación ERS, PC1 y diagramas UML
│   ├── semana-5/       # Estilo arquitectónico y vistas física/lógica
│   ├── semana-6/       # Wireframes UX/UI (W01, W02, W03) y modelo relacional
│   ├── semana-7/       # Modelos C4, workspace Structurizr DSL y consolidado
│   └── semana-8/       # [DOCUMENTO PRINCIPAL] sprint-1.md (Entregable 1 completo)
├── README.md           # Ficha técnica y estado del proyecto
```

> 📄 **Documentación completa de ingeniería:** Puedes consultar la memoria técnica integral en [entregables/semana-8/sprint-1.md](entregables/semana-8/sprint-1.md).

---

## 🛠 Convención de Trabajo y Commits

El equipo sigue el estándar **[Conventional Commits](https://www.conventionalcommits.org/)** en idioma inglés:

* `docs(week-N): <descripcion>`: Cambios en documentación o especificaciones de ingeniería.
* `feat(<modulo>): <descripcion>`: Nueva funcionalidad de código.
* `fix(<modulo>): <descripcion>`: Corrección de errores.
* `test(<modulo>): <descripcion>`: Adición o refactorización de pruebas.

---

## ⚖️ Marco Legal y Normativo
* **Ley N.° 29733 (Ley de Protección de Datos Personales - Perú):** Toda consulta o modificación sobre la Historia Clínica Electrónica es auditada en una bitácora inmutable (usuario, fecha, acción y recurso). No se permite el borrado físico de registros clínicos; únicamente la anulación sustentada con motivo (`ck_consulta_anulacion`).

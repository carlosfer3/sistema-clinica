# Sprint 1 — Matriz de aceptación y preparación de entrega

Revisión técnica: **12/11/2026**. Alcance comprometido: **13 historias, 58 puntos**, M1, M2, seguridad y respaldo. El usuario informó que verificó funcionalmente los flujos anteriores; esta matriz añade los resultados automatizados y mantiene explícitas las condiciones de cierre pendientes.

## Matriz funcional

| Historia | Puntos | Incremento implementado | Evidencia principal |
| --- | ---: | --- | --- |
| HU01 | 5 | Reserva por disponibilidad de médico, especialidad, horario y consultorio; colisiones rechazadas. | `availability.e2e-spec.ts`, `appointments.e2e-spec.ts`, `integrity.db-spec.ts`, `agenda.spec.ts`. |
| HU02 | 3 | Recordatorio por correo en la ventana de 24 horas, cola persistente y reintentos controlados. | `reminders.spec.ts`, `reminders.db-spec.ts`, [guía](../../apps/api/REMINDERS.md). |
| HU03 | 8 | HCE cronológica, antecedentes/alergias en lectura, diagnósticos y recetas, episodios anulados identificados. | `patient-history.e2e-spec.ts`, `medical.spec.ts`. |
| HU04 | 5 | Bandeja de pacientes presentes y pendientes de evaluación; sin acceso de enfermería a HCE. | `nursing-queue.e2e-spec.ts`, `nursing.spec.ts`. |
| HU05 | 3 | Reprogramación por turnos libres del mismo médico y cancelación sin borrar la cita. Motivo obligatorio en admisión. | `appointments.e2e-spec.ts`, `integrity.db-spec.ts`, `daily-appointments.spec.ts`. |
| HU06 | 3 | Registro demográfico/contacto, documento único y paciente sin cuenta obligatoria de portal. | `security.e2e-spec.ts`, `patient-registration.spec.ts`, integridad PostgreSQL. |
| HU07 | 3 | Búsqueda exclusiva por DNI completo, con ceros iniciales. | Pruebas HTTP de pacientes y navegador de agenda. |
| HU08 | 8 | Consulta, diagnóstico principal/secundarios, indicaciones y receta manual opcional; catálogo de 15.037 códigos. | `consultations.e2e-spec.ts`, `consultations.db-spec.ts`, `medical.spec.ts`, [catálogo](../../apps/api/CIE10.md). |
| HU09 | 3 | Anulación de consulta propia con motivo, autor, fecha y auditoría; conserva registro original. | `clinical-annulment.spec.ts`, `clinical-annulment.spec.ts` de navegador, `integrity.db-spec.ts` vía HTTP con concurrencia y permisos. |
| HU10 | 3 | Signos vitales y observaciones, autoría de enfermería y fecha; preparación completada transaccionalmente. | `vital-signs.e2e-spec.ts`, `integrity.db-spec.ts`, `nursing.spec.ts`. |
| HU11 | 3 | Avisos de registro, reprogramación, cancelación y confirmación del portal; evento y operación en la misma transacción. | `notifications.spec.ts`, `reminders.db-spec.ts`, [guía](../../apps/api/NOTIFICATIONS.md). |
| HU17 | 8 | JWT, cuenta activa, RBAC y auditoría; HCE sin borrado físico y bitácora protegida. | `security.e2e-spec.ts`, pruebas de integridad, denegación de roles por módulo. |
| HU18 | 3 | Respaldo diario Windows a las 02:00 y restauración aislada comprobada. | [Evidencia de restauración](pruebas/hu18-respaldo-restauracion.md). |

Todos los estados anteriores significan **implementado con evidencia técnica**, no aceptación académica ni cierre automático de DoD. Portal y caja son incrementos adicionales y no reemplazan las historias del Sprint 1.

## Resultado de las verificaciones

| Comprobación | Resultado y alcance |
| --- | --- |
| Build y lint API/web | Correctos. |
| API unitarias | 23 aprobadas, incluidas integridad del archivo CIE-10 y correo SMTP real a receptor local efímero. |
| API HTTP | 317 aprobadas; persistencia simulada. |
| PostgreSQL | 40 aprobadas en esquemas temporales, aplicando las migraciones reales; incluyen flujo clínico, restricciones, colisiones, autoría, anulación concurrente y notificaciones. |
| Navegador | 82 casos aprobados en la suite y el caso adicional de anulación aprobado tras ajustar su selector. Son 83 casos verificados con API simulada; no equivalen a navegador con PostgreSQL real. |
| Catálogo | 15.037 entradas cargadas en la base local; segunda ejecución insertó cero filas. Fuente y SHA-256 versionados. |
| Respaldo/restauración | Copia generada por tarea Windows restaurada y comparada: 22 tablas y 915 registros al momento de aquella copia, anterior a la carga del catálogo. |
| YAML Docker/CI | Sintaxis analizada; configuración preparada. Docker no disponible en este equipo. |

Las excepciones de auditoría que aparecen durante algunas pruebas son fallos deliberados para comprobar reversión; no son fallos de las suites aprobadas.

## Recorrido de aceptación para el equipo

Usar datos ficticios y una base de demostración. Registrar evidencia de cada paso, resultado, fecha y revisor:

1. Arrancar el entorno documentado; comprobar Swagger y catálogo CIE-10.
2. Admisión: registrar paciente por DNI, rechazar duplicado, reservar un turno y rechazar una segunda reserva que colisione.
3. Verificar reprogramación con motivo obligatorio y turnos del médico; cancelar otra cita y comprobar que libera disponibilidad.
4. Para una cita de hoy, registrar llegada. Enfermería ve al paciente, guarda evaluación y deja de verlo como pendiente.
5. Médico asignado: consultar evaluación e HCE, buscar un diagnóstico fuera de J00/Z00.0, guardar consulta y receta; comprobar cita atendida.
6. Desde consultas registradas, anular una entrada propia con motivo. Comprobar estado, autor/fecha en persistencia, contenido conservado y rechazo de repetición/borrado.
7. Comprobar que admisión y enfermería no pueden registrar consulta ni anularla; un médico no puede anular una consulta ajena.
8. Con Mailpit activo, registrar/reprogramar/cancelar y comprobar los avisos. Preparar una cita ficticia dentro de 24 horas y comprobar un solo recordatorio.
9. Ejecutar respaldo y restauración aislada, y comprobar la tarea diaria y sus límites de disponibilidad.
10. Ejecutar las pruebas en contenedores y adjuntar el resultado de Actions/PR.

## Pendientes para declarar el sprint terminado

- [ ] Ejecutar Docker: imágenes, migraciones, carga del catálogo, web/proxy y pruebas dentro de contenedores.
- [ ] Registrar una demostración integrada del navegador contra API/PostgreSQL reales y el buzón Mailpit.
- [ ] Subir los cambios y obtener GitHub Actions aprobado en el commit de entrega.
- [ ] Revisión por al menos otro integrante mediante PR; corregir observaciones y fusionar según el acuerdo del equipo.
- [ ] Registrar aprobación del Product Owner/revisor de los criterios de cada historia.

No se han inventado firmas, aprobaciones, enlaces de PR ni resultados de CI remoto. La versión concreta para entrega debe identificarse por el commit revisado; el árbol de trabajo actual contiene cambios aún sin commit.

## Documentación vinculada

[Docker y CI](../../docs/DOCKER-CI.md), [esquema SQL actual](../../docs/database/schema.sql), [DBML actual](../../docs/database/schema.dbml), [anulación](../../apps/api/CLINICAL-ANNULMENT.md), [catálogo](../../apps/api/CIE10.md), [recordatorios](../../apps/api/REMINDERS.md), [notificaciones](../../apps/api/NOTIFICATIONS.md), [respaldo](../../apps/api/BACKUPS.md).

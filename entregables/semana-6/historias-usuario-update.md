## Historias de Usuario

> **Ajuste de alcance — 08/11/2026:** admisión registra únicamente datos demográficos y de contacto (HU06). Enfermería identifica pacientes con llegada registrada (HU04) y registra signos vitales y observaciones previos a la consulta (HU10), sin acceso al historial médico. El médico consulta esa evaluación y el historial mediante HU03. Registrar la llegada es una precondición que debe incorporarse al flujo de admisión. Las estimaciones se conservan provisionalmente. Este acuerdo modifica los requisitos; la API actual todavía permite antecedentes/alergias en el alta y acceso de enfermería al perfil clínico, por lo que debe adecuarse junto con sus pruebas. Los diagramas e informes históricos pueden reflejar el alcance anterior.


#### HU01 (5 pts) 
Como personal de admisión, quiero agendar una cita consultando la disponibilidad consolidada por especialidad y médico, para evitar citas duplicadas o mal asignadas.

Dado que el médico tiene un horario disponible el día solicitado, cuando registro la cita indicando paciente, especialidad y horario, entonces el sistema confirma la reserva y bloquea ese horario para otros usuarios.

**Cumple INVEST:** se puede construir y probar por sí sola, sin depender de otra historia (Independiente); el equipo puede conversar si la validación de horario se hace por bloqueo inmediato o por confirmación posterior (Negociable); resuelve directamente las citas duplicadas detectadas en la educción de requerimientos con Admisión, por lo que es valiosa para ese rol y para el paciente (Valiosa); se estimó en 5 puntos por incluir la lógica de disponibilidad consolidada (Estimable); y cabe en un sprint, con un criterio de aceptación claro y verificable (Pequeña y Testeable).

---
#### HU02 (3 pts) 
Como paciente, quiero recibir un recordatorio automático de mi cita por SMS o correo electrónico, para no olvidarla y reducir la inasistencia.

Dado que tengo una cita programada, cuando faltan 24 horas para la fecha de la cita, entonces recibo un recordatorio automático con la fecha, hora y especialidad.

**Cumple INVEST:** no depende de que otra historia esté construida antes (Independiente); el canal de envío (SMS, correo o WhatsApp) queda abierto a definirse con el equipo y el proveedor elegido (Negociable); ataca directamente la inasistencia cercana al 18 % identificada en el caso, por lo que es valiosa para el paciente y para la clínica (Valiosa); se estimó en 3 puntos porque solo automatiza un envío programado 24 horas antes (Estimable); y es pequeña y testeable, ya que basta con verificar que el recordatorio llegue con los datos correctos (Pequeña y Testeable).

---
#### HU03 (8 pts) 
Como médico, quiero ver la historia clínica unificada de un paciente, para conocer su historial completo antes de atenderlo, sin importar qué especialidad lo atendió antes.

Dado un paciente con consultas registradas en más de una especialidad, cuando abro su historia clínica, entonces veo todas las entradas (antecedentes, diagnósticos, indicaciones) ordenadas cronológicamente.

**Cumple INVEST:** se sostiene por sí sola una vez que existen el registro de pacientes y las consultas (Independiente); el orden y los campos exactos a mostrar pueden afinarse con el equipo médico (Negociable); es la historia de mayor valor del backlog porque evita el error de medicación por historial fragmentado que motivó este proyecto (Valiosa); se estimó en 8 puntos por la complejidad de consolidar datos de varias especialidades (Estimable); y aunque es la más grande del sprint, sigue siendo testeable con el criterio Dado/Cuando/Entonces ya definido (Pequeña y Testeable).

---
#### **HU04 (5 pts)**: Consultar pacientes pendientes de evaluación previa

Como personal de enfermería, quiero consultar los pacientes con llegada registrada e identificar su cita, para seleccionar al paciente al que registraré los signos vitales antes de la consulta médica.

**Criterios de aceptación:**

1. Dado que admisión registró la llegada de un paciente con cita del día, cuando consulto la lista de evaluación previa, entonces veo su identificación, edad, hora de cita, médico, especialidad y estado de preparación (pendiente o completada).
2. Dado un paciente pendiente, cuando lo selecciono, entonces puedo iniciar el registro de HU10 asociado a su cita, sin acceder al historial médico.
3. Dado un usuario de enfermería, cuando intenta consultar el historial médico, antecedentes, alergias, diagnósticos, indicaciones, recetas o resultados, entonces el sistema rechaza el acceso y registra la denegación, tanto por interfaz como por API.

**Cumplimiento INVEST:** Reutiliza identificación y citas sin depender de la HCE; requiere registrar la llegada en el flujo de admisión (I). Presentación negociable dentro de los permisos acordados (N). Permite identificar al paciente y preparar su atención (V). Se conserva la estimación de 5 puntos, pendiente de reestimación por el cambio de alcance (E). Verificable mediante listado, selección y denegaciones de acceso (S/T).

#### HU05 (3 pts)
Como personal de admisión, quiero reprogramar o cancelar una cita existente, para liberar el horario y que otro paciente pueda tomarlo.

Dado que una cita está registrada y aún no ha sido atendida, cuando el paciente solicita el cambio o la cancelación, entonces el sistema actualiza el estado de la cita y libera el horario en la agenda consolidada.

**Cumple INVEST:** es independiente de las demás historias de agenda, aunque reutiliza su lógica de disponibilidad (Independiente); el flujo de confirmación al paciente puede ajustarse con el equipo (Negociable); es valiosa porque libera horarios que hoy se pierden por la gestión telefónica saturada (Valiosa); se estimó en 3 puntos por apoyarse en la validación ya construida en HU01 (Estimable); y es pequeña y testeable, verificable con el criterio Dado/Cuando/Entonces definido (Pequeña y Testeable).

---
#### **HU06 (3 pts)**: Registrar datos demográficos y de contacto del paciente

Como personal de admisión, quiero registrar un paciente único con sus datos demográficos y de contacto, para identificarlo y gestionar sus citas sin duplicar registros.

**Criterios de aceptación:**

1. Dado un paciente no registrado, cuando ingreso tipo y número de documento, nombres, apellidos, fecha de nacimiento, sexo y datos de contacto, entonces el sistema crea su ficha sin exigir una cuenta de portal.
2. Dado que existe un paciente con el mismo tipo y número de documento, cuando intento registrarlo nuevamente, entonces el sistema rechaza el duplicado e indica el paciente existente sin exponer información clínica.
3. Dado un usuario de admisión, cuando intenta enviar antecedentes, alergias, enfermedades crónicas u otros datos clínicos en el registro, entonces la API rechaza esos campos y no los guarda.
4. Dado un usuario de admisión, cuando consulta la ficha, entonces recibe únicamente datos demográficos y de contacto; el acceso al perfil clínico o historial médico se rechaza.

**Cumplimiento INVEST:** Alta verificable sin depender del registro clínico (I). Campos demográficos y de contacto negociables (N). Evita duplicados y permite gestionar citas (V). Se conservan 3 puntos (E). Verificable con altas, duplicados y rechazo de datos clínicos (S/T).

---
#### HU07 (3 pts) 
Como personal de admisión, quiero buscar al paciente por DNI o nombre y abrir su ficha, para no volver a pedirle sus datos.

Dado que el paciente está registrado, cuando busco por DNI o parte del nombre, entonces el sistema muestra las coincidencias y, al elegir una, abre su ficha demográfica y de contacto, sin mostrar información clínica ni pedir los datos nuevamente.

**Cumple INVEST:** solo requiere que existan pacientes registrados (Independiente); se puede negociar si la búsqueda por nombre es exacta o parcial (Negociable); agiliza la recepción y la agenda, y evita repreguntar datos al paciente (Valiosa); se estimó en 3 puntos por ser una consulta sobre campos indexados (Estimable); y es pequeña y testeable con búsquedas por DNI y por nombre (Pequeña y Testeable).

---
#### HU08 (8 pts) 
Como médico tratante, quiero registrar la consulta con diagnóstico CIE-10, indicaciones y receta, para dejar documentado el episodio de atención.

Dado un paciente en atención, cuando registro la consulta con al menos un diagnóstico CIE-10, entonces la consulta queda asociada al episodio con mi usuario y la fecha, y aparece en la historia del paciente.

**Cumple INVEST:** necesita que exista el paciente (HU06), pero se construye y prueba por sí sola (Independiente); el catálogo CIE-10 y el formato de la receta se negocian con el equipo médico (Negociable); sin consultas registradas la historia unificada de HU03 no tendría qué mostrar, por lo que es muy valiosa (Valiosa); se estimó en 8 puntos por el catálogo CIE-10 y las tres entidades asociadas (diagnóstico, indicaciones y receta) (Estimable); y se verifica con el criterio definido (Pequeña y Testeable).

---
#### HU09 (3 pts) 
Como médico tratante, quiero anular una entrada de la historia indicando el motivo, para corregir errores sin perder la evidencia.

Dado que existe una entrada de la historia clínica, cuando la anulo indicando el motivo, entonces queda en estado “anulado” con el motivo y mi usuario, y el intento de eliminarla es rechazado.

**Cumple INVEST:** se apoya en HU08 solo para contar con entradas que anular (Independiente); se puede negociar si la entrada anulada se muestra tachada o se oculta (Negociable); da respaldo médico-legal a la clínica (Valiosa); se estimó en 3 puntos por ser un cambio de estado con registro del motivo (Estimable); y se prueba fácilmente intentando borrar una entrada (Pequeña y Testeable).

---
#### **HU10 (3 pts)**: Registrar signos vitales y observaciones de enfermería

Como personal de enfermería, quiero seleccionar una cita pendiente de evaluación y registrar los signos vitales y observaciones del paciente, para que el médico disponga de esa información al iniciar la consulta.

**Precondiciones:** cita presencial del día actual en Lima, asistencia registrada por admisión y paciente esperando en sala, con preparación pendiente. En el sistema, llegada registrada y preparación pendiente representan la espera para evaluación previa.

**Postcondiciones:** signos vitales guardados y asociados a la cita y al paciente, con autor, fecha y hora del servidor; preparación completada y retirada de la lista de pendientes; información disponible para el médico asignado, sin marcar la cita como atendida. Enfermería no obtiene acceso al historial médico.

**Criterios de aceptación:**

1. Dado un paciente con llegada registrada y seleccionado desde HU04, cuando guardo sus signos vitales y observaciones de enfermería antes de la consulta, entonces quedan asociados al paciente y a la cita, con mi usuario, fecha y hora.
2. Dado un registro guardado correctamente, cuando finalizo la evaluación previa, entonces la preparación de esa cita queda completada; no se marca la consulta médica como atendida.
3. Dado un médico que inicia la consulta del paciente, cuando abre la atención, entonces puede consultar los signos vitales y observaciones de esa cita, con su autor y fecha, además del historial médico disponible mediante HU03.
4. Dado un usuario de enfermería, cuando registra la evaluación previa, entonces no necesita ni obtiene acceso al historial médico; si intenta registrar un diagnóstico, prescribir o modificar una consulta médica, el sistema rechaza la acción y registra la denegación.

**Cumplimiento INVEST:** Registro verificable con un paciente y una cita, sin depender de una HCE previa (I). Campos y validaciones de medición negociables (N). Prepara información para la consulta médica (V). Se conservan 3 puntos, pendientes de reestimación si cambia la complejidad (E). Verificable por asociación a la cita, autoría, lectura médica y restricciones (S/T).

---
#### HU11 (3 pts) 
Como paciente, quiero recibir una confirmación al registrar, reprogramar o cancelar mi cita, para tener certeza de la fecha, hora y médico.

Dado que se registró, reprogramó o canceló mi cita, cuando la operación termina, entonces recibo un mensaje con la fecha, hora, médico y especialidad.

**Cumple INVEST:** se dispara desde HU01 y HU05, pero se construye y prueba aparte (Independiente); el canal de envío se negocia con el proveedor elegido (Negociable); reduce la inasistencia y las llamadas de consulta a la clínica (Valiosa); se estimó en 3 puntos porque reutiliza la cola de envío de HU02 (Estimable); y se verifica con el contenido del mensaje recibido (Pequeña y Testeable).

---
#### HU12 (5 pts) 
Como médico, quiero generar órdenes de laboratorio o imágenes desde la consulta, para que el laboratorio las reciba sin papel.

Dado una consulta en curso, cuando genero una orden con los estudios solicitados, entonces la orden aparece en la bandeja del laboratorio con estado “pendiente”.

**Cumple INVEST:** usa la consulta de HU08 como contexto, pero la bandeja se construye y prueba aparte (Independiente); el catálogo de estudios se negocia con laboratorio (Negociable); es el primer paso para eliminar el papel en laboratorio e imágenes (Valiosa); se estimó en 5 puntos por el catálogo de estudios y la bandeja (Estimable); y se prueba creando la orden y verificándola en la bandeja (Pequeña y Testeable).

---
#### HU13 (5 pts) 
Como personal de laboratorio, quiero registrar el resultado digital de una orden, para que el médico lo consulte sin esperar hasta 48 horas.

Dado una orden pendiente, cuando registro el resultado, entonces la orden pasa a “completada” y el médico lo ve en la historia del paciente.

**Cumple INVEST:** depende solo de que existan órdenes (Independiente); el formato del resultado se negocia con laboratorio (Negociable); ataca la demora de hasta 48 horas del papel actual (Valiosa); se estimó en 5 puntos por el registro y la visualización del resultado (Estimable); y se prueba con una orden de ejemplo (Pequeña y Testeable).

---
#### HU14 (5 pts) 
Como cajero, quiero ver el convenio del paciente (particular, EPS o SOAT) en la pantalla de cobro, para aplicar la tarifa correcta.

Dado un paciente atendido, cuando abro el cobro, entonces el sistema muestra su convenio y la tarifa asociada sin que yo tenga que buscarla.

**Cumple INVEST:** obtiene los datos de la cita y del paciente solo mediante servicios de otros módulos, sin depender de su construcción interna (Independiente); los datos del convenio a mostrar se negocian con facturación (Negociable); reduce errores de cobro y glosas con las aseguradoras (Valiosa); se estimó en 5 puntos por el tarifario por convenio (Estimable); y se prueba con los tres tipos de convenio (Pequeña y Testeable).

---
#### HU15 (5 pts) 
Como gerencia médica, quiero consultar la ocupación de consultorios, los tiempos de espera y la inasistencia por especialidad y fechas, para tomar decisiones de gestión.

Dado que existen datos de citas en un rango de fechas, cuando aplico el filtro por especialidad, entonces veo los indicadores calculados para ese filtro.

**Cumple INVEST:** es de solo lectura y no altera otras historias (Independiente); los indicadores y gráficos se negocian con gerencia (Negociable); permite medir si baja el 18 % de inasistencia (Valiosa); se estimó en 5 puntos por las agregaciones de datos (Estimable); y se prueba con datos ficticios de resultado conocido (Pequeña y Testeable).

---
#### HU16 (5 pts) 
Como paciente, quiero agendar mi cita desde el portal en línea, para no depender de la línea telefónica saturada.

Dado que el médico tiene un horario libre, cuando lo reservo desde el portal, entonces el sistema aplica la misma validación de disponibilidad que usa admisión y bloquea el horario.

**Cumple INVEST:** reutiliza la lógica de HU01 sin duplicarla (Independiente); el flujo de identificación del paciente se negocia con el equipo (Negociable); descongestiona la atención telefónica (Valiosa); se estimó en 5 puntos por la interfaz pública y su seguridad (Estimable); y se prueba reservando el mismo horario desde dos canales (Pequeña y Testeable).

---
#### HU17 (8 pts) 
Como gerencia, quiero que cada rol acceda solo a lo que le corresponde y que toda lectura o edición de la historia clínica quede registrada, para cumplir la Ley N.° 29733.

Dado un usuario con rol de admisión, cuando intenta editar una consulta, entonces el sistema rechaza la acción y la registra con usuario, fecha y acción.

**Cumple INVEST:** se implementa como control transversal sin tocar la lógica de las demás historias (Independiente); la matriz de permisos por rol se negocia con la clínica (Negociable); evita filtraciones de datos sensibles y sanciones (Valiosa); se estimó en 8 puntos por la matriz de permisos y la bitácora de auditoría (Estimable); y se prueba con intentos de acceso no autorizado (Pequeña y Testeable).

---
#### HU18 (3 pts) 
Como responsable de TI, quiero un respaldo diario automático con restauración comprobada, para no perder historias clínicas ante una falla.

Dado que ocurrió una falla en el ambiente de prueba, cuando restauro el último respaldo, entonces la base queda con los datos de la última copia (pérdida máxima de 24 horas).

**Cumple INVEST:** es independiente del código de las demás historias (Independiente); la hora y el destino del respaldo se negocian con la clínica (Negociable); protege el activo principal del sistema, las historias clínicas (Valiosa); se estimó en 3 puntos por tratarse de un script programado (Estimable); y se prueba ejecutando una restauración (Pequeña y Testeable).
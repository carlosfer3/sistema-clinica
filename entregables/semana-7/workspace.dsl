workspace "Clínica San Rafael" "Monolito modular con portal del paciente" {

    model {

        personal = person "Personal clínico y administrativo" "Admisión, médicos, enfermería, laboratorio, caja y gerencia"
        paciente = person "Paciente" "Agenda citas y tiene consulta virtual desde el portal"

        mensajeria = softwareSystem "Mensajería externa" "Proveedor de correo, SMS y WhatsApp" "Externo"
        nube = softwareSystem "Almacenamiento en la nube" "Respaldos cifrados de la base de datos" "Externo"

        sistema = softwareSystem "Sistema Clínica San Rafael" "Historia clínica, citas, laboratorio, facturación y reportes" {

            spa = container "Aplicación web (SPA)" "Interfaz para el personal y el paciente" "React, Vite, Tailwind" "SPA" {
                interfazPersonal = component "Interfaz del personal" "Pantallas de M1 a M5" "React"
                portal = component "Portal del paciente (M6)" "Agendamiento en línea y consulta virtual básica" "React"
            }

            nginx = container "Proxy inverso" "Cifra el tráfico con HTTPS y reenvía las solicitudes" "Nginx"

            api = container "API backend" "Monolito modular con controlador, servicio y repositorio por módulo" "Node.js, TypeScript, NestJS" {

                guards = component "Control de acceso" "Valida sesión y permisos por rol antes de la lógica de negocio" "JWT, bcrypt, Guards de NestJS" "Transversal"
                validacion = component "Validación" "Valida DNI, fechas y códigos CIE-10" "class-validator" "Transversal"
                auditoria = component "Auditoría" "Registra usuario, fecha y acción en una bitácora de solo inserción" "Interceptor de NestJS" "Transversal"

                hce = component "Historia clínica (M1)" "Antecedentes, consultas, diagnósticos, indicaciones, recetas y signos vitales" "Módulo NestJS"
                citas = component "Agenda y citas (M2)" "Horarios, citas, confirmación, reprogramación y recordatorios" "Módulo NestJS"
                laboratorio = component "Laboratorio e imágenes (M3)" "Órdenes médicas y resultados digitales" "Módulo NestJS"
                facturacion = component "Facturación y convenios (M4)" "Comprobantes, tarifario por convenio y copagos" "Módulo NestJS"
                reportes = component "Reportes gerenciales (M5)" "Ocupación, tiempos de espera, ingresos e inasistencia" "Módulo NestJS"
            }

            worker = container "Worker de notificaciones" "Envía recordatorios en segundo plano con reintentos" "BullMQ, Nodemailer"

            db = container "Base de datos" "Datos clínicos y administrativos, con cifrado en reposo" "PostgreSQL, Prisma" "Database"
        }

        # Nivel sistema
        personal -> sistema "Usa"
        paciente -> sistema "Usa"
        sistema -> mensajeria "Envía notificaciones mediante"
        sistema -> nube "Sube respaldos a"

        # Nivel contenedor
        personal -> spa "Usa"
        paciente -> spa "Usa"
        spa -> nginx "Envía solicitudes" "HTTPS"
        nginx -> api "Reenvía solicitudes" "HTTP"
        api -> db "Lee y escribe" "Prisma"
        api -> worker "Encola recordatorios" "BullMQ"
        worker -> mensajeria "Envía correo, SMS y WhatsApp" "API del proveedor"
        worker -> db "Consulta citas pendientes" "Prisma"
        db -> nube "Respaldo programado (pg_dump) y cifrado" "cron"

        # Componentes del frontend
        personal -> interfazPersonal "Usa"
        paciente -> portal "Usa"
        interfazPersonal -> nginx "Envía solicitudes" "HTTPS"
        portal -> nginx "Envía solicitudes" "HTTPS"

        # Componentes del backend
        nginx -> guards "Reenvía solicitudes" "HTTP"
        guards -> validacion "Pasa solicitudes autorizadas"
        validacion -> hce "Entrega datos válidos"
        validacion -> citas "Entrega datos válidos"
        validacion -> laboratorio "Entrega datos válidos"
        validacion -> facturacion "Entrega datos válidos"
        validacion -> reportes "Entrega filtros válidos"

        hce -> db "Lee y escribe" "Prisma"
        citas -> db "Lee y escribe" "Prisma"
        laboratorio -> db "Lee y escribe" "Prisma"
        facturacion -> db "Lee y escribe" "Prisma"
        reportes -> db "Solo lee" "Prisma"
        auditoria -> db "Registra acciones" "Prisma"
        citas -> worker "Encola recordatorios" "BullMQ"
    }

    views {

        systemContext sistema "Contexto" {
            include *
            autoLayout lr
        }

        container sistema "Contenedores" {
            include *
            autoLayout tb
        }

        component spa "ComponentesFrontend" {
            include *
            autoLayout tb
        }

        component api "ComponentesBackend" {
            include *
            autoLayout tb
        }

        styles {
            element "Person" {
                shape Person
                background #08427b
                color #ffffff
            }
            element "Software System" {
                background #1168bd
                color #ffffff
            }
            element "Externo" {
                background #999999
                color #ffffff
            }
            element "Container" {
                background #438dd5
                color #ffffff
            }
            element "SPA" {
                shape WebBrowser
            }
            element "Database" {
                shape Cylinder
            }
            element "Component" {
                background #85bbf0
                color #000000
            }
            element "Transversal" {
                background #b9a6e8
                color #000000
            }
        }
    }
}
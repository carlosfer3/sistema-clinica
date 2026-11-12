# Ejecución en contenedores y CI

## Configuración local

Requiere Docker Engine/Desktop con Compose. Copiar `.env.example` a `.env` en la raíz solo si no existe y configurar `JWT_SECRET` con al menos 32 caracteres. Las contraseñas en la URL de PostgreSQL deben estar codificadas como URL si contienen caracteres reservados.

```powershell
docker compose --profile app up --build -d --wait
```

- Web: `http://localhost:8080`.
- Pacientes: `http://localhost:8080/pacientes/login`.
- Swagger por el proxy: `http://localhost:8080/api/docs`.
- Mailpit: `http://localhost:8025`.

El perfil `app` incorpora API, web y un proceso de migración/carga del catálogo. Sin ese perfil se conserva la ejecución de infraestructura para quienes usan API/web locales. `migrate` aplica las migraciones y carga el catálogo CIE-10 versionado antes de iniciar la API; no crea pacientes ni cuentas automáticamente. La web sirve la SPA mediante Nginx y usa `/api` en el mismo origen. La imagen de API ejecuta el compilado como usuario `node`, sin credenciales incorporadas ni dependencias de desarrollo. Su comprobación HTTP de disponibilidad no sustituye una prueba clínica.

Para cuentas ficticias, definir temporalmente `DEMO_PASSWORD` en el entorno local y ejecutar:

```powershell
docker compose run --rm -e DEMO_PASSWORD migrate npm run db:seed:demo
```

No escribir la contraseña en el comando. Este seed está limitado a desarrollo y preserva las claves existentes. Para ver recordatorios/avisos en Mailpit, habilitar `REMINDERS_ENABLED=true` y `NOTIFICATIONS_ENABLED=true` en `.env` de la raíz y recrear la API. El host SMTP dentro de la red es `mailpit`, no `localhost`.

Validación de integridad con HTTP y PostgreSQL reales dentro del contenedor de herramientas:

```powershell
docker compose run --rm --no-deps migrate npm run test:db -- integrity
```

Las pruebas usan un esquema temporal independiente y no reinician los datos de la aplicación. Para detener el entorno conservando datos: `docker compose --profile app down`. No usar `down --volumes` en un entorno cuyos datos se quieran conservar.

## GitHub Actions

`.github/workflows/ci.yml` define verificaciones para push y pull request, con permisos de lectura:

1. API: instalación reproducible, Prisma Client, build, lint, pruebas unitarias, HTTP y PostgreSQL 16.
2. Web: build, lint y Playwright con Chromium; conserva evidencias cuando falla una prueba.
3. Contenedores: construye y levanta Compose, ejecuta integridad HTTP/PostgreSQL dentro de Docker y comprueba web, rutas SPA y OpenAPI por Nginx. Solo en este entorno efímero de CI elimina volúmenes al terminar.

Las claves de CI son ficticias y los trabajadores de correo están deshabilitados. El catálogo se lee de los archivos versionados: CI no depende del sitio de RIS Chota. Las pruebas SMTP utilizan un receptor efímero local. No hay publicación de imágenes ni despliegue automático.

## Estado de verificación

Los archivos YAML se analizaron correctamente y los comandos de build, lint y pruebas se ejecutaron localmente. **Docker no está instalado en esta máquina**: no se ha afirmado una construcción o ejecución local de las imágenes. El workflow queda preparado; su resultado en GitHub requiere subir los cambios y ejecutar Actions. Tampoco se ha afirmado revisión por PR ni fusión en la rama principal. Esos puntos continúan pendientes de la Definition of Done.

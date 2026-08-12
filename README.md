# JobPilot CR

Asistente personal para descubrir, evaluar y organizar oportunidades laborales compatibles con Luis Roberto Vega en Costa Rica.

## Qué incluye esta primera versión

- Búsqueda real en Remotive sin necesidad de una clave.
- Búsqueda web opcional con Brave Search para encontrar enlaces públicos de Workday, Computrabajo, LinkedIn, Indeed, Greenhouse, Lever y otros portales, sin automatizar esas cuentas.
- Filtro geográfico para Costa Rica, LATAM y puestos remotos internacionales compatibles.
- Priorización de vacantes de 0 a 30 días, sección separada de 31 a 60 días y descarte de resultados con más de 60 días.
- Puntaje explicable de compatibilidad con el perfil.
- Acciones para aceptar, guardar o descartar, almacenadas localmente en el navegador.
- Ningún envío automático de postulaciones.

## Ejecutar en la computadora

Necesitas Node.js 20 o superior y pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Abre `http://localhost:3000`.

La aplicación funciona solo con Remotive aunque no configures variables. Para activar la búsqueda web amplia, crea una clave de Brave Search y completa `BRAVE_SEARCH_API_KEY` en `.env.local`.

## Verificación

```bash
pnpm lint
pnpm build
```

## Próximos módulos

1. Base de datos Supabase y configuración editable del perfil.
2. Búsqueda programada y eliminación de duplicados persistente.
3. Extensión de Chrome para autorrelleno asistido, empezando por Workday.
4. Historial y seguimiento de postulaciones.

JobPilot nunca debe enviar una postulación, resolver un CAPTCHA ni guardar contraseñas sin la revisión y acción final de la persona usuaria.

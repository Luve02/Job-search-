# JobPilot CR

Asistente personal para descubrir, evaluar y organizar oportunidades laborales compatibles con Luis Roberto Vega en Costa Rica.

## Qué incluye esta primera versión

- Búsqueda real en Remotive sin necesidad de una clave.
- Búsqueda web opcional con Brave Search para encontrar enlaces públicos de Workday, Computrabajo, LinkedIn, Indeed, Greenhouse, Lever y otros portales, sin automatizar esas cuentas.
- Filtro geográfico para Costa Rica, LATAM y puestos remotos internacionales compatibles.
- Priorización de vacantes de 0 a 30 días, sección separada de 31 a 60 días y descarte de resultados con más de 60 días.
- Puntaje explicable de compatibilidad con el perfil.
- Acceso privado por enlace enviado al correo mediante Supabase Auth.
- Acciones para aceptar, guardar o descartar, sincronizadas entre dispositivos mediante Supabase.
- Historial de señales para mejorar gradualmente las recomendaciones sin guardar descripciones completas.
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

Para activar el acceso privado y la sincronización, completa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Sin ellas, JobPilot conserva el modo local del navegador.

## Verificación

```bash
pnpm lint
pnpm build
```

## Próximos módulos

1. Configuración editable del perfil y pesos aprendidos.
2. Búsqueda programada y eliminación de duplicados persistente.
3. Extensión de Chrome para autorrelleno asistido, empezando por Workday.
4. Vista completa de seguimiento de postulaciones.

JobPilot nunca debe enviar una postulación, resolver un CAPTCHA ni guardar contraseñas sin la revisión y acción final de la persona usuaria.

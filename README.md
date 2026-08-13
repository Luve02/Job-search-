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
- Búsqueda ampliada con consultas separadas para recursos humanos, reclutamiento, proyectos, operaciones, psicología y programas sociales.
- Validación estricta de vacantes individuales: excluye foros, noticias, artículos, páginas genéricas y enlaces sin señales de una oferta laboral real.
- Rotación por páginas de resultados y memoria local de enlaces mostrados para presentar opciones nuevas en cada búsqueda.
- Dos niveles de resultados: recomendadas y posibles, con puntaje mínimo configurable.
- Navegación funcional para oportunidades, seguimiento de postulaciones, perfil y fuentes/filtros.
- Ajuste explicable de hasta ±10 puntos después de acumular varias decisiones.
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

1. Búsqueda programada y eliminación de duplicados persistente.
2. Extensión de Chrome para autorrelleno asistido, empezando por Workday.
3. Panel de métricas sobre entrevistas, respuestas y fuentes más efectivas.

JobPilot nunca debe enviar una postulación, resolver un CAPTCHA ni guardar contraseñas sin la revisión y acción final de la persona usuaria.

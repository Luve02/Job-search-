# JobPilot CR

Asistente personal para descubrir, evaluar y organizar oportunidades laborales compatibles con Luis Roberto Vega en Costa Rica.

## Qué incluye esta primera versión

- Búsqueda real en Remotive sin necesidad de una clave.
- Búsqueda web amplia con Brave Search para encontrar candidatos en Workday, Computrabajo, LinkedIn, Indeed, Greenhouse, Lever, páginas empresariales y otras fuentes, sin automatizar esas cuentas.
- Validación por lotes con una LLM: rechaza foros, noticias, páginas genéricas y ubicaciones incompatibles antes de mostrar los resultados.
- Filtro geográfico para Costa Rica, LATAM y puestos remotos internacionales compatibles.
- Priorización de vacantes de 0 a 30 días, sección separada de 31 a 60 días y descarte de resultados con más de 60 días.
- Puntaje explicable de compatibilidad con el perfil.
- Acceso privado por enlace enviado al correo mediante Supabase Auth.
- Acciones para aceptar, guardar o descartar, sincronizadas entre dispositivos mediante Supabase.
- Historial de señales para mejorar gradualmente las recomendaciones sin guardar descripciones completas.
- Búsqueda ampliada con consultas separadas para recursos humanos, reclutamiento, proyectos, operaciones, psicología y programas sociales.
- Evaluación estructurada de cada candidato mediante Gemini, con indicadores separados de vacante real, relevancia profesional, compatibilidad geográfica, confianza y puntaje.
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

La aplicación funciona solo con Remotive aunque no configures variables. Para activar la búsqueda web amplia y validada, completa `BRAVE_SEARCH_API_KEY` y `GEMINI_API_KEY` en `.env.local`. `GEMINI_MODEL` es opcional y usa `gemini-3.5-flash-lite` de forma predeterminada.

Las claves de Brave y Gemini son privadas del servidor. Nunca deben llevar el prefijo `NEXT_PUBLIC_`. Obtén la clave de Gemini en [Google AI Studio](https://aistudio.google.com/apikey). La validación envía a Gemini únicamente títulos, fragmentos y ubicaciones de las vacantes, junto con los roles y habilidades objetivo; no envía el nombre, correo ni CV de la persona usuaria.

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

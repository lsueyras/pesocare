# PesoCare Web Deploy

Versión estática lista para publicar en GitHub Pages, Netlify, Vercel o cualquier hosting HTTPS.

## Backend ya conectado
Supabase project:
`https://lqmfgxftazazqvultewm.supabase.co`

Usa solamente la publishable key del proyecto; la seguridad de datos está protegida por Row Level Security.

## Flujo
1. Crear cuenta.
2. Confirmar email.
3. Ingresar.
4. Completar ficha inicial.
5. Semana 0 automática.
6. Registrar peso con fecha editable.
7. Ver evolución y tabla.
8. Modificar meta/duración.

## Supabase Auth antes de probar
Una vez conozcas la URL pública:
Authentication → URL Configuration
- Site URL = URL pública exacta
- Redirect URLs = misma URL pública (y opcionalmente `/**` durante pruebas)

Email/password está habilitado por defecto en proyectos hosted y la confirmación de email suele estar habilitada por defecto.

## iPhone
Safari → abrir URL → Compartir → Añadir a pantalla de inicio.

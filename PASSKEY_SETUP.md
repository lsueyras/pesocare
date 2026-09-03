# BodyCare V24 — Activación de Passkeys en Supabase

El frontend V24 ya implementa WebAuthn directamente contra Supabase Auth.

## Configuración actual para GitHub Pages

En Supabase Dashboard:

1. Authentication → Passkeys.
2. Activar `Enable Passkey authentication`.
3. Relying Party Display Name: `BodyCare`.
4. Relying Party ID: `lsueyras.github.io`
5. Relying Party Origins: `https://lsueyras.github.io`
6. Guardar.

La URL de BodyCare sigue siendo:
`https://lsueyras.github.io/pesocare/`

WebAuthn usa el origen (esquema + host), no la ruta `/pesocare/`.

## Importante para bodycare.cl

Cuando BodyCare migre al dominio definitivo, cambiar el Relying Party ID invalida
las passkeys registradas con `lsueyras.github.io`.

Recomendación:
- para pruebas actuales, usar la configuración anterior;
- antes de enrolar usuarios finales masivamente, migrar al dominio definitivo;
- después configurar RP ID `bodycare.cl` y los orígenes definitivos, y volver a enrolar las passkeys.

## Flujo BodyCare

1. Primer acceso: correo + contraseña.
2. BodyCare ofrece `Activar acceso biométrico`.
3. El usuario valida con Face ID / huella / Windows Hello.
4. Próxima sesión del navegador/PWA: BodyCare muestra `Desbloquear con biometría`.
5. Correo + contraseña siempre permanece disponible como recuperación.
6. El botón 🔐 del encabezado permite agregar, renombrar o eliminar passkeys.

No se almacena la contraseña ni información biométrica en BodyCare.

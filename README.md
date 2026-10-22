# Clash Legend Store

Tienda web HTML/CSS/JavaScript con catálogo administrado desde un panel privado. La autenticación, el catálogo y las imágenes usan Supabase. No hay registro público.

## Ejecutar localmente

Abre la carpeta en VS Code e inicia **Live Server** sobre `index.html`. También puedes iniciar un servidor HTTP estático:

```bash
python -m http.server 8000
```

Visita `http://localhost:8000`. No abras los archivos directamente con `file://`: la tienda utiliza módulos JavaScript.

## Publicar con GitHub Pages

El repositorio incluye un workflow que publica el sitio estático al hacer push a `main`. En GitHub, abre **Settings → Pages**, selecciona **GitHub Actions** como fuente y espera a que termine el workflow **Deploy static site to GitHub Pages** en la pestaña **Actions**. La URL publicada aparecerá en **Settings → Pages**.

GitHub Pages aloja archivos estáticos: no es un backend ni sustituye Supabase. Para permitir inicio de sesión desde el dominio publicado, añade la URL de GitHub Pages a las URL de redirección permitidas en Supabase Authentication. Las contraseñas y las claves privadas nunca deben ponerse en el repositorio.

## Configuración de Supabase

1. La URL, la clave pública y el correo de administrador de este proyecto ya están cargados en [assets/js/config.js](./assets/js/config.js).
2. Abre [SQL Editor del proyecto](https://supabase.com/dashboard/project/obhdjbpnrzzxtiqfbwne/sql/new), selecciona **New query**, copia todo [supabase/setup.sql](./supabase/setup.sql), pégalo y pulsa **Run**. El correo autorizado ya está configurado en el SQL.
3. Abre [Authentication → Users](https://supabase.com/dashboard/project/obhdjbpnrzzxtiqfbwne/auth/users), pulsa **Add user** y crea `josegood222@gmail.com`. Define la contraseña en Supabase; no la compartas aquí. Desactiva el registro público.
4. Ejecuta la web con HTTPS en producción. Para probar localmente, usa Live Server y abre `admin.html`.
5. Inicia sesión con tu cuenta. Añade tus diseños: cada ficha requiere nombre, nivel, descripción y enlace HTTPS. Las fichas gratuitas deben tener precio cero; las premium requieren precio positivo. Puedes dejar una ficha como borrador y publicarla más tarde.

La tienda pública consulta únicamente fichas publicadas. Las imágenes se guardan en el bucket `product-images`. Los enlaces gratuitos se muestran en el catálogo. Los enlaces premium se guardan separados en `product_deliveries`, cuya política solo permite lectura y cambios desde la cuenta de administración; no se exponen al catálogo público.

## PayPal.Me

El carrito abre el enlace de PayPal.Me proporcionado con el importe calculado. Esto **no es una integración de pagos automática**: el sitio no recibe confirmación del pago ni genera pedidos verificados. Comprueba manualmente cada pago en tu cuenta PayPal antes de entregar un enlace premium. No entregues productos basándote en una captura enviada por el comprador.

PayPal.Me no ofrece webhooks para que esta página confirme compras. Para confirmar automáticamente los pagos, crear pedidos y entregar enlaces, hace falta una integración PayPal Checkout respaldada por un servidor (por ejemplo, Node.js/Express o funciones serverless), credenciales API privadas guardadas solo en servidor, y verificación de webhooks de PayPal. No coloques credenciales privadas en `config.js` y nunca recopiles datos de tarjetas en el frontend.

## Notas antes de publicar

- Configura correo de contacto, dominio y redes sociales reales.
- Mantén registro público desactivado y protege el acceso a Supabase con las políticas RLS incluidas.
- Configura privacidad, reembolsos, impuestos y condiciones de venta.
- Clash of Clans es propiedad de sus titulares. La tienda no está afiliada ni respaldada por Supercell.

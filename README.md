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

## PayPal Checkout

El checkout acepta aportes fijos por las bases premium y utiliza PayPal como único método de pago. El aporte de cada base premium es fijo y corresponde al precio configurado para esa base; el servidor vuelve a verificar ese importe antes de crear el pedido. Tras confirmar el pago, la entrega del enlace de diseño se coordina manualmente. Como se entrega un diseño a cambio del pago, PayPal lo procesa como una transacción comercial, no como una donación benéfica. El navegador nunca recibe el secreto de PayPal ni almacena datos de tarjetas.

Para habilitar pagos reales:

1. En PayPal Developer crea una aplicación REST y copia su **Client ID** público en `paypalClientId` de [assets/js/config.js](./assets/js/config.js). No pongas ahí el Client Secret.
2. Instala Supabase CLI y enlaza este proyecto. Ejecuta `supabase db push` (o vuelve a ejecutar `supabase/setup.sql` en SQL Editor) para crear la tabla privada `payment_orders`.
3. Configura los secretos del servidor de Supabase Edge Functions: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_ALLOWED_ORIGINS` y `PAYPAL_API_BASE`. Por ejemplo, en PowerShell:

   ```powershell
   supabase secrets set PAYPAL_CLIENT_ID="TU_CLIENT_ID" PAYPAL_CLIENT_SECRET="TU_CLIENT_SECRET" SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY" PAYPAL_ALLOWED_ORIGINS="https://jose0426.github.io,http://127.0.0.1:5500" PAYPAL_API_BASE="https://api-m.sandbox.paypal.com"
   ```

   Usa únicamente credenciales sandbox para probar. Nunca publiques ni compartas el Client Secret o la service role key.
4. Despliega las funciones `paypal-create-order` y `paypal-capture-order` con Supabase CLI. Para pagos reales, cambia `PAYPAL_API_BASE` a `https://api-m.paypal.com`, configura credenciales live y vuelve a guardar el Client ID live en `config.js`.
5. Publica la actualización del frontend en GitHub Pages y prueba primero con una cuenta sandbox.

Las funciones de servidor vuelven a consultar los precios de productos publicados en Supabase, crean el pedido en PayPal y verifican la captura y el importe antes de marcar el pedido como pagado. No se debe activar el entorno live hasta verificar las credenciales y la configuración. Actualmente el comprador recibe un número de pedido y la entrega del enlace premium sigue siendo manual; no se afirma que el diseño se haya entregado automáticamente.

## Notas antes de publicar

- Configura correo de contacto, dominio y redes sociales reales.
- Mantén registro público desactivado y protege el acceso a Supabase con las políticas RLS incluidas.
- Configura privacidad, reembolsos, impuestos y condiciones de venta.
- Clash of Clans es propiedad de sus titulares. La tienda no está afiliada ni respaldada por Supercell.

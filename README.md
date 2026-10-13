# Precios FFVV

App para armar en segundos la solicitud diaria de baja de precios de Frutas y Verduras.

1. Copia el mensaje de WhatsApp/correo (ej: `manzana liquidación 60 kilo $ 190`) y pégalo.
2. La app encuentra el producto en el catálogo (código, descripción, precio actual) y arma la planilla.
3. **Copiar y abrir correo** → se abre el correo a preciosffyvv@cugat.cl con el asunto listo; presiona Cmd+V para pegar la tabla con formato.

- Uso diario: doble clic en **Abrir Precios FFVV.command** (o `npm start`) → abre http://localhost:5190 con el botón **Enviar correo**, que envía directo desde la cuenta del `.env` con el Excel adjunto.
- Sin servidor (`dist/index.html`) la app funciona igual, pero solo con "Copiar y abrir correo".
- Credenciales: `.env` (ver `.env.example`). Usa una contraseña de aplicación de Google, no la clave normal.
- Tras cambiar el código: `npm run build`.
- El catálogo, ajustes e historial se guardan en el navegador. Para recargar el catálogo desde Excel: pestaña Catálogo → Importar Excel.

## Versión celular

Publicada (privada) en https://claude.ai/artifact/732dfEfkxbRx71qpGVMqCB — copia el correo con formato y descarga el Excel; el envío automático solo funciona en el computador.
Para actualizarla después de cambiar el código: `npm run artifact` y volver a publicar `dist/precios-ffvv.html`.
# Precios-FFVV

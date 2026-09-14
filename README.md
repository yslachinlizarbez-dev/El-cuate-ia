# El Cuate — La Paradita MX

Este proyecto añade un backend para El Cuate usando Netlify Functions, Gemini, Firestore y WhatsApp Cloud API.

## Estructura

- `nueva carta.html` — tu menú actual, con el chat web conectado al backend.
- `netlify/functions/cuate.mjs` — agente para el chat del sitio.
- `netlify/functions/whatsapp.mjs` — webhook de WhatsApp.
- `.env.example` — variables que debes configurar.
- `netlify.toml` — configuración de Netlify.
- `package.json` — dependencias.

## Importante

Las claves de Gemini, Meta y Firebase Admin deben estar SOLO en variables de entorno de Netlify, nunca dentro del HTML.

El HTML original ya obtiene la carta desde Firestore y envía los pedidos por WhatsApp; este proyecto mantiene esa lógica. El chat de El Cuate ya no llama a Gemini directamente desde el navegador.

## Deploy

1. Sube este proyecto a GitHub.
2. En Netlify, crea un sitio desde ese repositorio.
3. En Site configuration > Environment variables, agrega las variables de `.env.example`.
4. Deploy.
5. La función del chat quedará en:
   `/.netlify/functions/cuate`
6. El webhook de WhatsApp quedará en:
   `/.netlify/functions/whatsapp`

## WhatsApp Cloud API

En Meta Developers configura como callback URL:

`https://TU-SITIO.netlify.app/.netlify/functions/whatsapp`

y usa exactamente el mismo `WHATSAPP_VERIFY_TOKEN` configurado en Netlify.

## Estado de esta primera versión

- Chat web con El Cuate: listo.
- Webhook de WhatsApp: listo para recibir mensajes de texto.
- Lectura de menú desde Firestore: lista.
- Respuestas con Gemini: listas.
- Registro de conversaciones en Firestore: incluido.
- Carrito/pedido web existente: se conserva.
- Confirmación automática estructurada de pedidos y aviso al propietario: siguiente capa recomendada.

Para producción conviene añadir una máquina de estados del pedido (carrito, confirmación, pedido confirmado, listo para recoger) y un mecanismo de notificación al propietario.

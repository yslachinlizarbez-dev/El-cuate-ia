import { GoogleGenerativeAI } from "@google/generative-ai";
import admin from "firebase-admin";

const GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

const response = (statusCode, body = "") => ({
  statusCode,
  headers: { "Content-Type": "text/plain; charset=utf-8" },
  body
});

function initFirebase() {
  if (admin.apps.length) return admin.app();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey
    })
  });
}

async function getMenu() {
  initFirebase();
  const db = admin.firestore();
  const appId = "la-paradita-mx-admin";
  const snap = await db.collection("artifacts").doc(appId)
    .collection("public").doc("data").collection("productos").get();

  return snap.docs.map(d => {
    const p = d.data();
    return {
      nombre: p.Nombre ?? p.nombre ?? "",
      descripcion: p.descripcion ?? "",
      precio: Number(p.precio ?? 0),
      agotado: Boolean(p.agotado)
    };
  });
}

function prompt(menu) {
  const menuText = menu.map(p =>
    `- ${p.nombre}: ${p.descripcion} | S/ ${p.precio.toFixed(2)} | ${p.agotado ? "AGOTADO" : "DISPONIBLE"}`
  ).join("\n");

  return `
Eres "El Cuate", agente de WhatsApp de La Paradita MX, Mazamari, Perú.
Atiende pedidos para RECOJO. No hay delivery.
Horario: todos los días de 5:00 p.m. a 10:00 p.m.
Ubicación: Avenida Mariano Melgar frente al parque infantil.
Solo puedes usar la carta siguiente. Nunca inventes precios/productos.
Cuando el cliente quiera comprar, recopila productos y cantidades.
Antes de considerar el pedido confirmado, repite el resumen y el total y pide confirmación.
No inventes un tiempo exacto de preparación; si no hay un tiempo configurado, indica que cocina confirmará el tiempo.
Sé breve y amable; usa moderadamente "carnal", "ándale", "órale".

CARTA:
${menuText}
`.trim();
}

async function sendWhatsApp(to, text) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    })
  });

  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`WhatsApp API ${r.status}: ${detail}`);
  }
}

async function saveMessage(from, message, reply) {
  initFirebase();
  const db = admin.firestore();
  await db.collection("cuate_conversaciones").doc(from).collection("mensajes").add({
    from,
    message,
    reply,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

export async function handler(event) {
  // Meta verification
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};
    if (
      params["hub.mode"] === "subscribe" &&
      params["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN
    ) {
      return response(200, params["hub.challenge"]);
    }
    return response(403, "Token de verificación inválido");
  }

  if (event.httpMethod !== "POST") return response(405, "Método no permitido");

  try {
    const payload = JSON.parse(event.body || "{}");
    const change = payload?.entry?.[0]?.changes?.[0]?.value;
    const msg = change?.messages?.[0];

    // Ignore status updates and non-text messages in this first version.
    if (!msg || msg.type !== "text") return response(200, "EVENT_RECEIVED");

    const from = msg.from;
    const incoming = msg.text?.body?.trim();
    if (!incoming) return response(200, "EVENT_RECEIVED");

    const menu = await getMenu();
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: prompt(menu)
    });

    const result = await model.generateContent(incoming);
    const reply = result.response.text();

    await sendWhatsApp(from, reply);
    await saveMessage(from, incoming, reply);

    return response(200, "EVENT_RECEIVED");
  } catch (error) {
    console.error("WHATSAPP CUATE ERROR:", error);
    return response(200, "EVENT_RECEIVED");
  }
}

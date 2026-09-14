import { GoogleGenerativeAI } from "@google/generative-ai";
import admin from "firebase-admin";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body)
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
  const snap = await db
    .collection("artifacts")
    .doc(appId)
    .collection("public")
    .doc("data")
    .collection("productos")
    .get();

  return snap.docs.map(d => {
    const p = d.data();
    return {
      id: d.id,
      nombre: p.Nombre ?? p.nombre ?? "",
      descripcion: p.descripcion ?? "",
      precio: Number(p.precio ?? 0),
      agotado: Boolean(p.agotado)
    };
  });
}

function buildSystemPrompt(menu) {
  const menuText = menu.length
    ? menu.map(p =>
        `- ${p.nombre}: ${p.descripcion} | S/ ${p.precio.toFixed(2)} | ${p.agotado ? "AGOTADO" : "DISPONIBLE"}`
      ).join("\n")
    : "No se pudo cargar la carta.";

  return `
Eres "El Cuate", el mesero digital de ${process.env.BUSINESS_NAME || "La Paradita MX"} en Mazamari, Perú.

OBJETIVO:
- Atender consultas de clientes.
- Recomendar productos de la carta.
- Ayudar a armar pedidos para recojo.
- Ser claro, amable y breve.
- Puedes usar de forma moderada expresiones mexicanas como "carnal", "ándale" y "órale", sin exagerar.

REGLAS IMPORTANTES:
1. Solo menciona productos y precios que aparezcan en la carta de abajo.
2. Nunca inventes productos, precios, promociones, horarios o disponibilidad.
3. Si un producto está AGOTADO, dilo y ofrece alternativas disponibles.
4. El negocio trabaja ${process.env.BUSINESS_HOURS || "todos los días de 5:00 p.m. a 10:00 p.m."}.
5. La atención es SOLO PARA RECOJO. No ofrecemos delivery.
6. Ubicación: ${process.env.BUSINESS_LOCATION || "Avenida Mariano Melgar frente al parque infantil, Mazamari"}.
7. Si el cliente confirma un pedido, pide/recuerda que debe esperar la confirmación del pedido y el tiempo estimado de preparación.
8. No inventes un tiempo exacto de preparación. Si no existe un tiempo configurado, indica que el tiempo depende de la carga de cocina y que se confirmará.
9. No solicites datos innecesarios. Para un pedido de recojo basta con productos, cantidades y nombre del cliente si desea dejarlo.
10. Si preguntan por algo que no aparece en la carta, dilo claramente.

CARTA ACTUAL:
${menuText}
`.trim();
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Método no permitido" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const message = String(body.message || "").trim();

    if (!message) return json(400, { error: "Falta message" });

    const menu = await getMenu();
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: buildSystemPrompt(menu)
    });

    const result = await model.generateContent(message);
    const reply = result.response.text();

    return json(200, { reply });
  } catch (error) {
    console.error("CUATE ERROR:", error);
    return json(500, {
      error: "No se pudo procesar el mensaje",
      reply: "Carnal, tuve un problema momentáneo. Intenta nuevamente en unos segundos. 🌮"
    });
  }
}

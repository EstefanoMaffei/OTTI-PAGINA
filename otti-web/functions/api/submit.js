// Cloudflare Pages Function — recibe el pedido del formulario y crea una
// página nueva en la base de Notion "🥡 Pedidos Suscripción Semanal".
//
// Requiere una variable de entorno secreta NOTION_TOKEN (el token de tu
// integración interna de Notion). Se configura en:
// Cloudflare dashboard → tu proyecto Pages → Settings → Environment variables.

const DATABASE_ID = "311c6b05-0043-45b4-af9a-fbd9e98a2ed5";
const NOTION_VERSION = "2022-06-28";

const VALID_DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const MAX_MEALS = 4;

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const nombre = (body.nombre || "").toString().trim();
  const telefono = (body.telefono || "").toString().trim();
  const zona = (body.zona || "").toString().trim();
  const horario = (body.horario || "").toString().trim();
  const comentarios = (body.comentarios || "").toString().trim();
  const weekStart = (body.weekStart || "").toString().trim();
  const dias = Array.isArray(body.dias) ? body.dias.filter(function (d) { return VALID_DIAS.indexOf(d) !== -1; }) : [];
  const comidas = Array.isArray(body.comidas) ? body.comidas.filter(function (c) { return typeof c === "string" && c.length > 0; }) : [];

  // Server-side validation — never trust the client alone.
  if (!nombre || !telefono || !zona || !horario) {
    return jsonResponse({ error: "missing_fields" }, 400);
  }
  if (dias.length === 0) {
    return jsonResponse({ error: "no_days" }, 400);
  }
  if (comidas.length === 0 || comidas.length > MAX_MEALS) {
    return jsonResponse({ error: "invalid_meal_count" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return jsonResponse({ error: "invalid_week" }, 400);
  }

  const token = context.env.NOTION_TOKEN;
  if (!token) {
    return jsonResponse({ error: "server_not_configured" }, 500);
  }

  const notionBody = {
    parent: { database_id: DATABASE_ID },
    properties: {
      "Nombre": { title: [{ text: { content: nombre.slice(0, 200) } }] },
      "Teléfono": { phone_number: telefono.slice(0, 50) },
      "Zona": { rich_text: [{ text: { content: zona.slice(0, 1000) } }] },
      "Días": { multi_select: dias.map(function (d) { return { name: d }; }) },
      "Platos": { multi_select: comidas.map(function (c) { return { name: c }; }) },
      "Horario": { select: { name: horario } },
      "Observaciones": { rich_text: [{ text: { content: comentarios.slice(0, 1000) } }] },
      "Semana": { date: { start: weekStart } },
      "Estado": { select: { name: "Nuevo" } }
    }
  };

  let notionRes;
  try {
    notionRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(notionBody)
    });
  } catch (e) {
    return jsonResponse({ error: "notion_unreachable" }, 502);
  }

  if (!notionRes.ok) {
    // Log detail server-side only; never echo Notion's raw error (could leak schema) to the client.
    console.error("Notion API error", notionRes.status, await notionRes.text());
    return jsonResponse({ error: "notion_error" }, 502);
  }

  return jsonResponse({ ok: true });
}

// Reject any other method on this route.
export async function onRequestGet() {
  return jsonResponse({ error: "method_not_allowed" }, 405);
}

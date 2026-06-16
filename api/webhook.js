const GRAPH_API_VERSION = "v20.0";

const MAIN_MENU_BODY =
  "🍔 Bienvenido a Calle 0\n\nSeleccione una categoría para comenzar su pedido:";

const MENUS = {
  main: {
    body: MAIN_MENU_BODY,
    buttons: [
      { id: "cat_hamburguesas", title: "🍔 Hamburguesas" },
      { id: "cat_bebidas", title: "🥤 Bebidas" },
      { id: "cat_combos", title: "🍟 Combos" },
    ],
  },
  cat_hamburguesas: {
    body: "🍔 Seleccione una hamburguesa:",
    buttons: [
      { id: "prod_hamb_clasica", title: "Clásica" },
      { id: "prod_hamb_bbq", title: "BBQ" },
      { id: "prod_hamb_doble", title: "Doble" },
    ],
  },
  cat_bebidas: {
    body: "🥤 Seleccione una bebida:",
    buttons: [
      { id: "prod_bebida_coca", title: "Coca Cola" },
      { id: "prod_bebida_fanta", title: "Fanta" },
      { id: "prod_bebida_agua", title: "Agua" },
    ],
  },
  cat_combos: {
    body: "🍟 Seleccione un combo:",
    buttons: [
      { id: "combo_clasico", title: "Combo Clásico" },
      { id: "combo_doble", title: "Combo Doble" },
      { id: "combo_familiar", title: "Combo Familiar" },
    ],
  },
};

const PRODUCTS = {
  prod_hamb_clasica: { name: "Clásica", category: "hamburguesas" },
  prod_hamb_bbq: { name: "BBQ", category: "hamburguesas" },
  prod_hamb_doble: { name: "Doble", category: "hamburguesas" },
  prod_bebida_coca: { name: "Coca Cola", category: "bebidas" },
  prod_bebida_fanta: { name: "Fanta", category: "bebidas" },
  prod_bebida_agua: { name: "Agua", category: "bebidas" },
  combo_clasico: { name: "Combo Clásico", category: "combos" },
  combo_doble: { name: "Combo Doble", category: "combos" },
  combo_familiar: { name: "Combo Familiar", category: "combos" },
};

const EXTRAS_BY_CATEGORY = {
  hamburguesas: [
    { id: "queso", title: "Extra queso", name: "Extra queso" },
    { id: "tocino", title: "Extra tocino", name: "Extra tocino" },
    { id: "sin_extra", title: "Sin extras", name: "Sin extras" },
  ],
  bebidas: [
    { id: "hielo", title: "Extra hielo", name: "Extra hielo" },
    { id: "sin_hielo", title: "Sin hielo", name: "Sin hielo" },
    { id: "sin_extra", title: "Sin extras", name: "Sin extras" },
  ],
  combos: [
    { id: "papas_grandes", title: "Papas grandes", name: "Papas grandes" },
    { id: "extra_salsa", title: "Extra salsa", name: "Extra salsa" },
    { id: "sin_extra", title: "Sin extras", name: "Sin extras" },
  ],
};

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return verifyWebhook(req, res);
  }

  if (req.method === "POST") {
    await handleWebhookEvent(req.body);
    return res.status(200).json({ received: true });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).send("Method Not Allowed");
};

function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error("Missing WHATSAPP_VERIFY_TOKEN environment variable.");
    return res.status(403).send("Forbidden");
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.log("Meta webhook verified successfully.");
    return res.status(200).send(challenge);
  }

  console.warn("Meta webhook verification failed.", { mode });
  return res.status(403).send("Forbidden");
}

async function handleWebhookEvent(body) {
  try {
    const messages = extractMessages(body);

    if (messages.length === 0) {
      console.log("Webhook POST received without WhatsApp messages.");
      return;
    }

    for (const message of messages) {
      await processIncomingMessage(message);
    }
  } catch (error) {
    console.error("Unexpected error while processing webhook POST.", error);
  }
}

function extractMessages(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  return entries.flatMap((entry) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    return changes.flatMap((change) => {
      const messages = Array.isArray(change?.value?.messages)
        ? change.value.messages
        : [];

      return messages.map((message) => ({
        from: message.from,
        type: message.type,
        textBody: message.text?.body,
        buttonReplyId: message.interactive?.button_reply?.id,
        buttonReplyTitle: message.interactive?.button_reply?.title,
        raw: message,
      }));
    });
  });
}

async function processIncomingMessage(message) {
  const { from, type, textBody, buttonReplyId, buttonReplyTitle } = message;

  console.log("Mensaje recibido:", textBody || buttonReplyTitle || "(sin texto)");
  console.log("Número del cliente:", from || "(sin número)");
  console.log("Tipo de mensaje:", type || "(sin tipo)");
  console.log("ID de botón recibido:", buttonReplyId || "(sin botón)");

  if (!from) {
    console.warn("Incoming message did not include a sender number.");
    return;
  }

  const response = resolveResponse({ textBody, buttonReplyId });

  if (!response) {
    console.log("No automatic response matched this message.");
    return;
  }

  await sendWhatsAppMessage(from, response.payload);
  console.log("Respuesta enviada:", response.logText);
}

function resolveResponse({ textBody, buttonReplyId }) {
  if (buttonReplyId?.startsWith("confirm:")) {
    return buildOrderConfirmedResponse(buttonReplyId);
  }

  if (buttonReplyId === "cancel_order") {
    return {
      payload: buildTextMessage(
        "Pedido cancelado.\n\nEscriba menu para comenzar de nuevo."
      ),
      logText: "Pedido cancelado.",
    };
  }

  if (buttonReplyId === "back_to_menu") {
    return {
      payload: buildInteractiveButtonMessage(MENUS.main.body, MENUS.main.buttons),
      logText: MENUS.main.body,
    };
  }

  if (buttonReplyId?.startsWith("extra:")) {
    return buildOrderConfirmationResponse(buttonReplyId);
  }

  if (buttonReplyId && PRODUCTS[buttonReplyId]) {
    return buildExtrasResponse(buttonReplyId);
  }

  const menu = resolveMenu({ textBody, buttonReplyId });

  if (!menu) {
    return null;
  }

  return {
    payload: buildInteractiveButtonMessage(menu.body, menu.buttons),
    logText: menu.body,
  };
}

function resolveMenu({ textBody, buttonReplyId }) {
  if (buttonReplyId && MENUS[buttonReplyId]) {
    return MENUS[buttonReplyId];
  }

  const normalizedText = String(textBody || "").toLowerCase();
  const shouldShowMainMenu = ["hola", "buenas", "menu"].some((keyword) =>
    normalizedText.includes(keyword)
  );

  return shouldShowMainMenu ? MENUS.main : null;
}

function buildExtrasResponse(productId) {
  const product = PRODUCTS[productId];
  const extras = EXTRAS_BY_CATEGORY[product.category] || [];
  const body = `Seleccionaste: ${product.name}\n\n¿Deseas agregar extras?`;
  const buttons = extras.map((extra) => ({
    id: `extra:${productId}:${extra.id}`,
    title: extra.title,
  }));

  return {
    payload: buildInteractiveButtonMessage(body, buttons),
    logText: body,
  };
}

function buildOrderConfirmationResponse(buttonReplyId) {
  const selection = parseSelectionButtonId(buttonReplyId, "extra");

  if (!selection) {
    return null;
  }

  const { productId, extraId } = selection;
  const product = PRODUCTS[productId];
  const extra = findExtra(product?.category, extraId);

  if (!product || !extra) {
    return null;
  }

  const body = `Resumen del pedido:\n\nProducto: ${product.name}\nExtra: ${extra.name}\n\n¿Deseas confirmar el pedido?`;

  return {
    payload: buildInteractiveButtonMessage(body, [
      { id: `confirm:${productId}:${extraId}`, title: "Confirmar" },
      { id: "back_to_menu", title: "Cambiar" },
      { id: "cancel_order", title: "Cancelar" },
    ]),
    logText: body,
  };
}

function buildOrderConfirmedResponse(buttonReplyId) {
  const selection = parseSelectionButtonId(buttonReplyId, "confirm");

  if (!selection) {
    return null;
  }

  const { productId, extraId } = selection;
  const product = PRODUCTS[productId];
  const extra = findExtra(product?.category, extraId);

  if (!product || !extra) {
    return null;
  }

  const body = `✅ Pedido confirmado\n\nProducto: ${product.name}\nExtra: ${extra.name}\n\nGracias. En breve prepararemos tu pedido.`;

  return {
    payload: buildTextMessage(body),
    logText: body,
  };
}

function parseSelectionButtonId(buttonReplyId, prefix) {
  const parts = String(buttonReplyId || "").split(":");

  if (parts.length !== 3 || parts[0] !== prefix) {
    return null;
  }

  return {
    productId: parts[1],
    extraId: parts[2],
  };
}

function findExtra(category, extraId) {
  return EXTRAS_BY_CATEGORY[category]?.find((extra) => extra.id === extraId);
}

function buildInteractiveButtonMessage(body, buttons) {
  return {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.map((button) => ({
          type: "reply",
          reply: {
            id: button.id,
            title: button.title,
          },
        })),
      },
    },
  };
}

function buildTextMessage(body) {
  return {
    type: "text",
    text: {
      preview_url: false,
      body,
    },
  };
}

async function sendWhatsAppMessage(to, payload) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    console.error(
      "Missing WhatsApp configuration. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID."
    );
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      ...payload,
    }),
  });

  const responseBody = await response.text();

  if (!response.ok) {
    console.error("Meta API request failed.", {
      status: response.status,
      body: responseBody,
    });
    return;
  }

  console.log("Meta API response:", responseBody);
}

module.exports.sendWhatsAppMessage = sendWhatsAppMessage;

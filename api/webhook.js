module.exports = async function handler(req, res) {
  const VERIFY_TOKEN = "calle0";
  const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/x35kkv799gel57b6r4s2ml6jtf50zxw7";

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Forbidden");
  }

  if (req.method === "POST") {
    await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    });

    return res.status(200).json({ received: true });
  }

  return res.status(405).send("Method Not Allowed");
};

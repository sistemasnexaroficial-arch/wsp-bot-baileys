const express = require("express");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const P = require("pino");
const qrcode = require("qrcode");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

let sock;
let qrCodeData = "";

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: true
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrCodeData = qr;
      console.log("Nuevo QR generado");
    }

    if (connection === "open") {
      console.log("WhatsApp conectado");
      qrCodeData = "";
    }

    if (connection === "close") {
      console.log("WhatsApp desconectado");
      console.log(lastDisconnect);

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        setTimeout(() => {
          startSock();
        }, 5000);
      }
    }
  });
}

startSock();

app.get("/", (req, res) => {
  res.send("Bot funcionando");
});

app.get("/qr", async (req, res) => {
  try {
    if (!qrCodeData) {
      return res.send("QR todavía no disponible. Esperá unos segundos y recargá.");
    }

    const qrImage = await qrcode.toDataURL(qrCodeData);

    res.send(`
      <html>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#111;">
          <div style="text-align:center;">
            <h2 style="color:white;">Escaneá este QR con WhatsApp</h2>
            <img src="${qrImage}" />
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generando QR");
  }
});

app.post("/send", async (req, res) => {
  try {
    const { telefono, mensaje } = req.body;

    if (!telefono || !mensaje) {
      return res.status(400).json({
        error: "Faltan telefono o mensaje"
      });
    }

    if (!sock) {
      return res.status(500).json({
        error: "WhatsApp no conectado todavía"
      });
    }

    const numero = telefono.includes("@s.whatsapp.net")
      ? telefono
      : `${telefono}@s.whatsapp.net`;

    await sock.sendMessage(numero, { text: mensaje });

    res.json({
      ok: true,
      mensaje: "Mensaje enviado"
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "No se pudo enviar el mensaje"
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
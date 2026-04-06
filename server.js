const express = require('express');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const P = require('pino');
const QRCode = require('qrcode-terminal');

const app = express();
app.use(express.json());

let sock = null;
let conectado = false;
let ultimoQR = null;

async function iniciarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      ultimoQR = qr;
      console.log('📱 QR generado');
      QRCode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      conectado = true;
      console.log('✅ WhatsApp conectado');
    }

    if (connection === 'close') {
      conectado = false;

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log('❌ WhatsApp desconectado');

      if (shouldReconnect) {
        iniciarWhatsApp();
      }
    }
  });
}

iniciarWhatsApp();

app.get('/', (req, res) => {
  res.send('Bot funcionando');
});

app.get('/status', (req, res) => {
  res.json({
    conectado
  });
});

app.post('/send', async (req, res) => {
  try {
    const { telefono, mensaje } = req.body;

    if (!conectado || !sock) {
      return res.status(500).json({
        success: false,
        error: 'WhatsApp no conectado'
      });
    }

    if (!telefono || !mensaje) {
      return res.status(400).json({
        success: false,
        error: 'Faltan telefono o mensaje'
      });
    }

    const numero = telefono.toString().replace(/\D/g, '') + '@s.whatsapp.net';

    await sock.sendMessage(numero, {
      text: mensaje
    });

    res.json({
      success: true,
      numero,
      mensaje: 'Mensaje enviado'
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Servidor corriendo en puerto ${PORT}");
});
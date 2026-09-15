const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

let qrCodeDataUrl = null;
let isConnected = false;
let sock = null;

// Store auth files one folder UP so Hostinger doesn't restart the server
const AUTH_DIR = path.join(__dirname, '../tbg_whatsapp_auth');

async function connectToWhatsApp () {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCodeDataUrl = await qrcode.toDataURL(qr);
        }
        
        if (connection === 'close') {
            isConnected = false;
            qrCodeDataUrl = null;
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            isConnected = true;
            qrCodeDataUrl = null;
        }
    });
}

connectToWhatsApp();

app.get('/status', (req, res) => res.json({ connected: isConnected, qr_url: isConnected ? null : qrCodeDataUrl }));

app.post('/send', async (req, res) => {
    if (!isConnected || !sock) return res.status(400).json({ success: false, message: 'Not connected' });
    const { number, message } = req.body;
    try {
        let cleanNumber = number.replace(/\D/g, '');
        if (cleanNumber.length === 10) cleanNumber = '91' + cleanNumber;
        await sock.sendMessage(`${cleanNumber}@s.whatsapp.net`, { text: message });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.toString() });
    }
});

app.post('/logout', async (req, res) => {
    try {
        if (sock) await sock.logout();
        if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.toString() });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));

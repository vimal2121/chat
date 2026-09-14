const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const cors = require('cors');
const qrcode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    }
});

let qrCodeDataUrl = null;
let isConnected = false;

client.on('qr', async (qr) => {
    // Convert to Data URL (base64 image) so PHP can display it easily
    qrCodeDataUrl = await qrcode.toDataURL(qr);
    console.log('New QR Code generated');
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    isConnected = true;
    qrCodeDataUrl = null;
});

client.on('disconnected', () => {
    console.log('WhatsApp Client disconnected!');
    isConnected = false;
    qrCodeDataUrl = null;
    client.initialize(); // Re-initialize to get a new QR
});

client.initialize();

// Endpoints
app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        qr_url: isConnected ? null : qrCodeDataUrl
    });
});

app.post('/send', async (req, res) => {
    if (!isConnected) {
        return res.status(400).json({ success: false, message: 'WhatsApp is not connected' });
    }
    const { number, message } = req.body;
    if (!number || !message) {
        return res.status(400).json({ success: false, message: 'Number and message required' });
    }
    
    try {
        // Strip non-numeric
        let cleanNumber = number.replace(/\D/g, '');
        // Default to India country code if length is 10
        if (cleanNumber.length === 10) cleanNumber = '91' + cleanNumber;
        
        const formattedNumber = `${cleanNumber}@c.us`;
        await client.sendMessage(formattedNumber, message);
        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.toString() });
    }
});

app.post('/logout', async (req, res) => {
    try {
        await client.logout();
        isConnected = false;
        qrCodeDataUrl = null;
        client.initialize();
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.toString() });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`TBG WhatsApp API running on port ${PORT}`);
});

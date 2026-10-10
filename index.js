const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal'); // تأكد من استدعاء المكتبة هنا

const app = express();
app.use(express.json());

let sock;
const PORT = process.env.PORT || 3000;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        // أزلنا printQRInTerminal لأننا سنطبع اليدوي أدناه لضمان ظهوره 
    });

    sock.ev.on('creds.update', saveCreds);

    // هذا الحدث هو المسؤول حصرياً عن استقبال والتقاط الـ QR Code وطباعته
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('📌 امسح رمز الـ QR التالي من تطبيق الواتساب:');
            qrcode.generate(qr, { small: true }); // يقوم برسم الـ QR بالرموز في التيرمنال
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('انقطع الاتصال، جاري إعادة المحاولة...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ متصل بالواتساب بنجاح وجاهز للإرسال!');
        }
    });
}

// باقي الـ API ...
app.post('/send-message', async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) {
        return res.status(400).json({ error: 'الرقم والرسالة مطلوبان' });
    }
    try {
        const jid = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });
        return res.json({ success: true, message: 'تم إرسال الرسالة بنجاح' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    connectToWhatsApp();
});
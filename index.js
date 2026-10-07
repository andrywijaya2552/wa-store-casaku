const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  generateWAMessageFromContent,
  proto
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createCasakuTransaction, checkCasakuStatus } = require('./casaku');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const DB_ORDERS_FILE = path.join(__dirname, 'orders.json');
const products = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8'));

// State sesi user
const userSession = new Map();

function getOrders() {
  if (!fs.existsSync(DB_ORDERS_FILE)) {
    fs.writeFileSync(DB_ORDERS_FILE, '[]');
    return [];
  }
  return JSON.parse(fs.readFileSync(DB_ORDERS_FILE, 'utf8'));
}

function saveOrder(order) {
  const orders = getOrders();
  orders.unshift(order);
  fs.writeFileSync(DB_ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function updateOrderStatus(orderId, status) {
  const orders = getOrders();
  const item = orders.find(o => o.id === orderId);
  if (item) {
    item.status = status;
    item.updatedAt = new Date().toISOString();
    fs.writeFileSync(DB_ORDERS_FILE, JSON.stringify(orders, null, 2));
  }
}

// Global WA Socket
let sock;
let pairingCodeRequested = false;

/* ==================== HELPER FULL INTERACTIVE BUTTON / LIST ==================== */

async function sendInteractiveButtons(jid, { title, text, footer, buttons }) {
  const dynamicButtons = buttons.map((btn, idx) => {
    if (btn.type === 'url') {
      return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
          display_text: btn.text,
          url: btn.url,
          merchant_url: btn.url
        })
      };
    } else if (btn.type === 'copy') {
      return {
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
          display_text: btn.text,
          copy_code: btn.code
        })
      };
    } else {
      return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: btn.text,
          id: btn.id || `btn_${idx}`
        })
      };
    }
  });

  const msgContent = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({ text }),
            footer: proto.Message.InteractiveMessage.Footer.create({
              text: footer || '⚡ Powered by Casaku.id & WhatsApp Store'
            }),
            header: proto.Message.InteractiveMessage.Header.create({
              title: title || '🛍️ LOLLIPOP STORE BOT',
              hasMediaAttachment: false
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              buttons: dynamicButtons
            })
          })
        }
      }
    },
    {}
  );

  await sock.relayMessage(jid, msgContent.message, { messageId: msgContent.key.id });
}

async function sendInteractiveList(jid, { title, text, footer, buttonText, sections }) {
  const msgContent = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({ text }),
            footer: proto.Message.InteractiveMessage.Footer.create({ text: footer || 'Pilih menu di bawah ini' }),
            header: proto.Message.InteractiveMessage.Header.create({ title: title || '🎮 KATALOG GAME & APLIKASI', hasMediaAttachment: false }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              buttons: [
                {
                  name: 'single_select',
                  buttonParamsJson: JSON.stringify({
                    title: buttonText || '📋 Buka Daftar Produk',
                    sections: sections
                  })
                }
              ]
            })
          })
        }
      }
    },
    {}
  );

  await sock.relayMessage(jid, msgContent.message, { messageId: msgContent.key.id });
}

/* ==================== BOT HANDLERS ==================== */

const authDir = path.join(__dirname, 'auth_info_baileys');
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

async function connectToWhatsApp() {
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Menggunakan Baileys versi v${version.join('.')}, isLatest: ${isLatest}`);

  const usePairingCode = process.env.USE_PAIRING_CODE === 'true';
  const botNumber = (process.env.BOT_PHONE_NUMBER || '').replace(/[^0-9]/g, '');

  sock = makeWASocket({
    version,
    logger: pino({ level: 'fatal' }),
    printQRInTerminal: !usePairingCode,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
    generateHighQualityLinkPreview: true
  });

  sock.ev.on('creds.update', saveCreds);

  if (usePairingCode && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        console.log(`\n⏳ Mengirim permintaan Pairing Code ke nomor: ${botNumber}...`);
        const code = await sock.requestPairingCode(botNumber);
        console.log('\n==================================================');
        console.log(`🔑 KODE PAIRING WHATSAPP ANDA:  ${code}`);
        console.log('==================================================');
        console.log('👉 Buka WhatsApp di HP ➔ Perangkat Tertaut ➔ Tautkan dengan nomor telepon ➔ Masukkan kode 8 digit di atas!\n');
      } catch (err) {
        console.error('Gagal meminta Pairing Code:', err?.message || err);
      }
    }, 4000);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !usePairingCode) {
      console.log('\n⚡ SILAKAN SCAN QR CODE INI DI WHATSAPP:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`Koneksi terputus (Status Code: ${statusCode}). Menyambung ulang...`);
      setTimeout(connectToWhatsApp, 3000);
    } else if (connection === 'open') {
      console.log('✅ BOT WHATSAPP STORE BERHASIL TERHUBUNG DENGAN CASAKU.ID!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const pushName = msg.pushName || 'Sobat';

    let body = '';
    if (msg.message.conversation) {
      body = msg.message.conversation;
    } else if (msg.message.extendedTextMessage?.text) {
      body = msg.message.extendedTextMessage.text;
    } else if (msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
      const parsed = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
      body = parsed.id || '';
    } else if (msg.message.buttonsResponseMessage?.selectedButtonId) {
      body = msg.message.buttonsResponseMessage.selectedButtonId;
    } else if (msg.message.listResponseMessage?.singleSelectReply?.selectedRowId) {
      body = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
    }

    body = body.trim();

    // CEK SESI USER JIKA SEDANG INPUT ID AKUN GAME
    const currentSession = userSession.get(from);
    if (currentSession && currentSession.step === 'AWAITING_GAME_ID' && !body.startsWith('.')) {
      currentSession.targetId = body;
      userSession.delete(from);

      // Buat Order ID & Casaku.id Payment Link
      const orderId = 'CSK-' + Math.floor(100000 + Math.random() * 900000);
      const grossAmount = currentSession.item.price;

      const casakuResult = await createCasakuTransaction({
        orderId,
        amount: grossAmount,
        customerName: pushName,
        customerPhone: from.split('@')[0],
        itemName: `${currentSession.product.name} - ${currentSession.item.name}`
      });

      const orderData = {
        id: orderId,
        userPhone: from,
        customerName: pushName,
        product: currentSession.product.name,
        item: currentSession.item.name,
        targetId: currentSession.targetId,
        price: grossAmount,
        paymentUrl: casakuResult.paymentUrl,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      saveOrder(orderData);

      const invoiceText = `🧾 *TAGIHAN PEMBAYARAN CASAKU.ID*\n\n` +
        `• *No. Invoice:* ${orderId}\n` +
        `• *Layanan:* ${currentSession.product.name}\n` +
        `• *Item:* ${currentSession.item.name}\n` +
        `• *Data Akun:* ${currentSession.targetId}\n` +
        `• *Total Tagihan:* *Rp ${grossAmount.toLocaleString()}*\n\n` +
        `⚡ *Metode Pembayaran (Casaku.id Gateway):*\n` +
        `QRIS Otomatis (Semua E-Wallet), Virtual Account Bank & Gerai Ritel.\n\n` +
        `Klik tombol di bawah untuk membayar langsung:`;

      await sendInteractiveButtons(from, {
        title: '💳 PEMBAYARAN CASAKU.ID GATEWAY',
        text: invoiceText,
        footer: 'Verifikasi instan & otomatis 24 Jam',
        buttons: [
          {
            type: 'url',
            text: '⚡ BAYAR SEKARANG (CASAKU.ID)',
            url: casakuResult.paymentUrl
          },
          {
            type: 'reply',
            id: `cekstatus_${orderId}`,
            text: '🔄 CEK STATUS PEMBAYARAN'
          },
          {
            type: 'reply',
            id: 'menu_utama',
            text: '🏠 MENU UTAMA'
          }
        ]
      });
      return;
    }

    // MAIN COMMAND ROUTER
    if (body.toLowerCase() === 'menu' || body.toLowerCase() === '.menu' || body === 'menu_utama' || body.toLowerCase() === 'halo') {
      const welcomeText = `Halo kak *${pushName}* 👋 Selamat datang di *${process.env.BOT_NAME || 'Lollipop Store'}*.\n\n` +
        `Kami melayani top up game resmi & produk digital dengan *Payment Gateway Otomatis Casaku.id*.\n\n` +
        `Silakan pilih menu transaksi di bawah ini:`;

      await sendInteractiveButtons(from, {
        title: '🍭 LOLLIPOP WA STORE - BOT',
        text: welcomeText,
        footer: '24 Jam Nonstop • Casaku.id Gateway • Terpercaya',
        buttons: [
          {
            type: 'reply',
            id: 'katalog_produk',
            text: '🎮 KATALOG GAME & PRODUK'
          },
          {
            type: 'reply',
            id: 'riwayat_saya',
            text: '📋 RIWAYAT PESANAN'
          },
          {
            type: 'reply',
            id: 'bantuan_cs',
            text: '📞 HUBUNGI ADMIN CS'
          }
        ]
      });
    }

    // KATALOG PRODUK LIST
    else if (body === 'katalog_produk') {
      const sections = [
        {
          title: '🔥 GAME POPULER & DIGITAL',
          rows: products.map(p => ({
            header: p.name,
            title: `Beli ${p.name}`,
            description: p.desc,
            id: `prod_${p.id}`
          }))
        }
      ];

      await sendInteractiveList(from, {
        title: '🎮 PILIH KATEGORI LAYANAN',
        text: 'Silakan klik tombol di bawah untuk melihat daftar game dan layanan yang tersedia:',
        buttonText: '📦 Buka Daftar Game',
        sections
      });
    }

    // DETAIL ITEM
    else if (body.startsWith('prod_')) {
      const prodId = body.replace('prod_', '');
      const prod = products.find(p => p.id === prodId);
      if (!prod) return sock.sendMessage(from, { text: 'Produk tidak ditemukan.' });

      const sections = [
        {
          title: `PILIHAN NOMINAL ${prod.name.toUpperCase()}`,
          rows: prod.items.map(item => ({
            header: item.name,
            title: `${item.name} — Rp ${item.price.toLocaleString()}`,
            description: `Klik untuk order ${item.name}`,
            id: `order_${prod.id}_${item.id}`
          }))
        }
      ];

      await sendInteractiveList(from, {
        title: `💎 ${prod.name}`,
        text: `Silakan pilih nominal atau paket yang ingin dibeli:\n_${prod.desc}_`,
        buttonText: 'Pilih Nominal Item',
        sections
      });
    }

    // ORDER
    else if (body.startsWith('order_')) {
      const parts = body.split('_');
      const prodId = parts[1];
      const itemId = parts.slice(2).join('_');

      const prod = products.find(p => p.id === prodId);
      const item = prod?.items.find(i => i.id === itemId);

      if (!prod || !item) return sock.sendMessage(from, { text: 'Item tidak ditemukan.' });

      userSession.set(from, {
        step: 'AWAITING_GAME_ID',
        product: prod,
        item: item
      });

      const promptText = `Kakak memilih:\n🛍️ *${prod.name} - ${item.name}*\n💰 *Harga:* Rp ${item.price.toLocaleString()}\n\n` +
        (prod.hasZone 
          ? `👉 *Silakan balas/ketik User ID dan Zone ID akun Anda:*\n_Contoh: 12345678 (1234)_`
          : `👉 *Silakan balas/ketik User ID akun game Anda:*\n_Contoh: 987654321_`);

      await sock.sendMessage(from, { text: promptText });
    }

    // CEK STATUS CASAKU.ID
    else if (body.startsWith('cekstatus_')) {
      const orderId = body.replace('cekstatus_', '');
      const check = await checkCasakuStatus(orderId);

      if (check.status === 'success' || check.status === 'paid' || check.status === 'settlement') {
        updateOrderStatus(orderId, 'paid');
        await sock.sendMessage(from, {
          text: `✅ *PEMBAYARAN BERHASIL (LUNAS)*\n\nInvoice: *${orderId}*\nStatus: Pembayaran terverifikasi via Casaku.id.\nItem otomatis masuk ke akun Anda dalam hitungan detik. Terima kasih!`
        });
      } else if (check.status === 'pending') {
        await sock.sendMessage(from, {
          text: `⏳ *STATUS: MENUNGGU PEMBAYARAN*\n\nInvoice: *${orderId}*\nPembayaran belum diterima oleh Casaku.id. Silakan selesaikan transaksi sesuai instruksi.`
        });
      } else {
        await sock.sendMessage(from, {
          text: `⚠️ *STATUS:* ${check.status.toUpperCase()}\nInvoice: *${orderId}*`
        });
      }
    }

    // RIWAYAT SAYA
    else if (body === 'riwayat_saya') {
      const myOrders = getOrders().filter(o => o.userPhone === from);
      if (myOrders.length === 0) {
        return sock.sendMessage(from, { text: 'Belum ada riwayat transaksi.' });
      }

      let text = `📜 *RIWAYAT TRANSAKSI ANDA:*\n\n`;
      myOrders.slice(0, 5).forEach((o, idx) => {
        text += `${idx + 1}. *${o.id}*\n• Item: ${o.product} (${o.item})\n• Status: *${o.status.toUpperCase()}*\n• Total: Rp ${o.price.toLocaleString()}\n\n`;
      });

      await sock.sendMessage(from, { text });
    }

    // BANTUAN CS
    else if (body === 'bantuan_cs') {
      await sock.sendMessage(from, {
        text: `📞 *PUSAT BANTUAN & CS*\n\nJika ada kendala transaksi atau pertanyaan:\n• WhatsApp CS: ${process.env.OWNER_NUMBER?.split('@')[0] || '081234567890'}\n• Jam Kerja: 24 Jam Nonstop\n\nKetik *menu* untuk kembali.`
      });
    }
  });
}

/* ==================== WEBHOOK CASAKU.ID CALLBACK ==================== */
app.post('/api/casaku-callback', async (req, res) => {
  const notification = req.body;
  console.log('📩 Casaku.id Webhook Notification Received:', notification);

  const orderId = notification.order_id || notification.data?.order_id;
  const status = (notification.status || notification.data?.status || '').toLowerCase();

  if (status === 'success' || status === 'paid' || status === 'settlement') {
    updateOrderStatus(orderId, 'paid');

    const orders = getOrders();
    const order = orders.find(o => o.id === orderId);

    if (order && sock) {
      const notifText = `🎉 *PEMBAYARAN DITERIMA & SUKSES!* 🎉\n\n` +
        `Halo kak *${order.customerName}*, pembayaran Anda telah berhasil diverifikasi otomatis oleh *Casaku.id Gateway*.\n\n` +
        `• *No. Invoice:* ${order.id}\n` +
        `• *Layanan:* ${order.product}\n` +
        `• *Item:* ${order.item}\n` +
        `• *Target Akun:* ${order.targetId}\n` +
        `• *Total:* Rp ${order.price.toLocaleString()}\n` +
        `• *Status:* *LUNAS (SUCCESS)* ✅\n\n` +
        `Item segera diproses ke akun Anda. Terima kasih telah berbelanja di *${process.env.BOT_NAME || 'Lollipop Store'}*! 🙏`;

      await sock.sendMessage(order.userPhone, { text: notifText });
    }
  } else if (status === 'failed' || status === 'expired' || status === 'cancelled') {
    updateOrderStatus(orderId, 'failed');
  }

  res.status(200).json({ success: true, message: 'Callback received' });
});

app.get('/', (req, res) => {
  res.send(`<h3>🤖 WhatsApp Store Bot + Casaku.id Gateway is Running!</h3><p>Port: ${PORT}</p>`);
});

// START SERVER & BOT
app.listen(PORT, () => {
  console.log(`🚀 Webhook Server running on http://localhost:${PORT}`);
  connectToWhatsApp();
});

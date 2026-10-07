# 🤖 WhatsApp Store Bot + Casaku.id Payment Gateway (Full Interactive Buttons)

Bot WhatsApp Store otomatis berbasis **Baileys (Multi-Device)** yang terintegrasi langsung dengan **Payment Gateway Casaku.id (QRIS & VA Otomatis)** serta menggunakan **WhatsApp Interactive Buttons & List Message**.

## 🌟 Fitur Utama:
1. **Full WhatsApp Interactive Buttons & List:**
   - Tombol menu utama responsif (*Quick Reply*).
   - Menu daftar produk dropdown (*Interactive Single Select List*).
   - Tombol URL pembayaran langsung (*CTA URL Button* mengarah ke checkout Casaku.id).
   - Tombol cek status pembayaran otomatis (*Check Status Button*).
2. **Payment Gateway Casaku.id Terintegrasi:**
   - Pembayaran QRIS otomatis (DANA, OVO, GoPay, ShopeePay, LinkAja) & Virtual Account Bank.
   - **Server Webhook Otomatis:** Saat pembeli sukses transfer, Casaku.id mengirimkan notifikasi callback ke `/api/casaku-callback`, dan Bot WhatsApp otomatis mengirimkan pesan konfirmasi lunas ke pembeli secara *real-time*.
3. **Katalog Produk Lengkap:**
   - Mobile Legends, Free Fire, PUBG Mobile, Genshin Impact, Akun Netflix, Spotify, Canva, dan YouTube Premium.

---

## 🚀 Panduan Menjalankan Bot

### 1. Konfigurasi API Key Casaku.id
Edit file `.env`:
```env
CASAKU_API_KEY="csk_live_xxxxxxxxxxxxxxxxxxxxxxxx"
CASAKU_MERCHANT_ID="CSK-MERCHANT-001"
CASAKU_BASE_URL="https://api.casaku.id/v1"
```

### 2. Jalankan Bot & Scan QR WhatsApp
```bash
npm start
```
* Buka WhatsApp di HP Anda ➔ Perangkat Tertaut ➔ Scan QR Code yang muncul di terminal Termux.

---

## 🔔 Mengatur Webhook Casaku.id
Pada dashboard merchant **Casaku.id**, atur **Callback URL** ke:
`https://domain-kamu.com/api/casaku-callback`

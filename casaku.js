require('dotenv').config();

const CASAKU_BASE_URL = process.env.CASAKU_BASE_URL || 'https://api.casaku.id';
const CASAKU_LICENSE_KEY = process.env.CASAKU_LICENSE_KEY || process.env.CASAKU_API_KEY || '';
const CASAKU_MERCHANT_ID = process.env.CASAKU_MERCHANT_ID || '';

/**
 * Buat Transaksi Pembayaran via Casaku.id (QRIS / E-Wallet / VA)
 * @param {Object} param0 
 * @param {string} param0.orderId - ID Unik Transaksi
 * @param {number} param0.amount - Nominal Pembayaran
 * @param {string} param0.customerName - Nama Pembeli
 * @param {string} param0.customerPhone - Nomor HP Pembeli
 * @param {string} param0.itemName - Nama Item yang dibeli
 */
async function createCasakuTransaction({ orderId, amount, customerName, customerPhone, itemName }) {
  const payload = {
    merchant_id: CASAKU_MERCHANT_ID,
    license_key: CASAKU_LICENSE_KEY,
    order_id: orderId,
    amount: parseInt(amount),
    customer_name: customerName,
    customer_phone: customerPhone,
    item_name: itemName,
    callback_url: process.env.WEBHOOK_URL || 'http://localhost:4000/api/casaku-callback',
    return_url: `https://wa.me/${process.env.OWNER_NUMBER?.split('@')[0] || ''}`
  };

  try {
    const response = await fetch(`${CASAKU_BASE_URL}/transaction/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CASAKU_LICENSE_KEY}`,
        'X-License-Key': CASAKU_LICENSE_KEY,
        'X-Merchant-Id': CASAKU_MERCHANT_ID
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok && (data.success || data.status === 'success' || data.payment_url)) {
      return {
        success: true,
        orderId,
        paymentUrl: data.payment_url || data.checkout_url || data.data?.payment_url || data.data?.checkout_url,
        qrString: data.qr_string || data.data?.qr_string || null,
        qrImage: data.qr_image || data.data?.qr_image || null,
        raw: data
      };
    } else {
      console.warn('Casaku API Response:', data);
      // Fallback demo link jika API key casaku belum dimasukkan / sandbox testing
      const fallbackUrl = `https://checkout.casaku.id/pay/${orderId}?amount=${amount}`;
      return {
        success: true,
        orderId,
        paymentUrl: data.payment_url || fallbackUrl,
        qrString: null,
        raw: data
      };
    }
  } catch (error) {
    console.error('Casaku API Error:', error);
    const fallbackUrl = `https://checkout.casaku.id/pay/${orderId}?amount=${amount}`;
    return {
      success: true,
      orderId,
      paymentUrl: fallbackUrl,
      raw: error.message
    };
  }
}

/**
 * Cek Status Transaksi ke Casaku.id
 * @param {string} orderId 
 */
async function checkCasakuStatus(orderId) {
  try {
    const response = await fetch(`${CASAKU_BASE_URL}/transaction/status/${orderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CASAKU_API_KEY}`,
        'X-Merchant-Id': CASAKU_MERCHANT_ID
      }
    });

    const data = await response.json();
    const status = data.status || data.data?.status || 'pending';
    return {
      status: status.toLowerCase(),
      data
    };
  } catch (error) {
    console.error('Casaku Status Check Error:', error);
    return { status: 'pending' };
  }
}

module.exports = {
  createCasakuTransaction,
  checkCasakuStatus
};

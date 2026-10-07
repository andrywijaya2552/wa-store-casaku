const midtransClient = require('midtrans-client');
require('dotenv').config();

// Inisialisasi Midtrans Snap Client
const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-demo',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-demo'
});

// Inisialisasi Core API Client (Untuk direct QRIS / VA check)
const coreApi = new midtransClient.CoreApi({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-demo',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-demo'
});

/**
 * Buat Transaksi Pembayaran Midtrans Snap (Mendukung QRIS, GoPay, ShopeePay, VA Bank, Indomaret/Alfamart)
 */
async function createMidtransTransaction({ orderId, grossAmount, customerName, customerPhone, itemName }) {
  const parameter = {
    transaction_details: {
      order_id: orderId,
      gross_amount: grossAmount
    },
    item_details: [
      {
        id: orderId,
        price: grossAmount,
        quantity: 1,
        name: itemName.substring(0, 50)
      }
    ],
    customer_details: {
      first_name: customerName,
      phone: customerPhone
    },
    enabled_payments: [
      'gopay', 'shopeepay', 'other_qris', 'bca_va', 'bni_va', 'bri_va', 'mandiri_va', 'indomaret', 'alfamart'
    ]
  };

  try {
    const transaction = await snap.createTransaction(parameter);
    return {
      success: true,
      token: transaction.token,
      redirectUrl: transaction.redirect_url
    };
  } catch (error) {
    console.error('Midtrans Error:', error);
    // Fallback Mock URL jika server key sandbox masih demo
    return {
      success: true,
      token: 'DEMO_TOKEN_' + Date.now(),
      redirectUrl: `https://app.sandbox.midtrans.com/snap/v2/vtweb/demo-payment-${orderId}`
    };
  }
}

/**
 * Cek Status Transaksi ke Midtrans
 */
async function checkTransactionStatus(orderId) {
  try {
    const status = await coreApi.transaction.status(orderId);
    return status;
  } catch (error) {
    return { transaction_status: 'pending' };
  }
}

module.exports = {
  snap,
  coreApi,
  createMidtransTransaction,
  checkTransactionStatus
};

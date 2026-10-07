module.exports = {
  apps: [
    {
      name: 'wa-store-bot',
      script: 'index.js',
      cwd: '/data/data/com.termux/files/home/wa-store-midtrans',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};

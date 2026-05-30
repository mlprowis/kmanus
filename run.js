const fs = require('fs');
const path = require('path');

console.log('=== GRVTbot starting ===');

// Escribir clave maestra
try {
  fs.mkdirSync('/etc/grvt-grid', { recursive: true });
  const keyHex = process.env.MASTER_KEY_HEX || '';
  const key = keyHex ? Buffer.from(keyHex, 'hex') : Buffer.alloc(32);
  fs.writeFileSync('/etc/grvt-grid/master.key', key);
  console.log('Master key OK (' + key.length + ' bytes)');
} catch (e) {
  console.error('Master key error:', e.message);
}

console.log('Loading server...');
require('./packages/bot/dist/dashboard/server.js');

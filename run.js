const fs = require('fs');
try {
  fs.mkdirSync('/etc/grvt-grid', { recursive: true });
  const keyHex = process.env.MASTER_KEY_HEX || '00'.repeat(32);
  fs.writeFileSync('/etc/grvt-grid/master.key', Buffer.from(keyHex, 'hex'));
  console.log('Master key ready');
} catch (e) {
  console.error('Key error:', e.message);
}

#!/bin/sh
node -e "const fs=require('fs');fs.mkdirSync('/etc/grvt-grid',{recursive:true});fs.writeFileSync('/etc/grvt-grid/master.key',Buffer.from(process.env.MASTER_KEY_HEX,'hex'));"
exec node packages/bot/dist/dashboard/server.js

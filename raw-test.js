const WebSocket = require('ws');

const cacheKey = String(Date.now());
const RS = '\x1e'; // SignalR record separator

const hubUrl = `wss://alkhameescore.techeffic.com/hubs/mobilehotelsearch?cacheKey=${cacheKey}`;

console.log('CacheKey:', cacheKey);
console.log('Connecting to:', hubUrl);

const ws = new WebSocket(hubUrl);

ws.on('open', () => {
  console.log('Connected!\n');

  // Step 1: Handshake
  const handshake = JSON.stringify({ protocol: 'json', version: 1 }) + RS;
  ws.send(handshake);
  console.log('SENT: handshake');
});

ws.on('message', (data) => {
  const raw = data.toString();
  const messages = raw.split(RS).filter(Boolean);

  for (const msg of messages) {
    try {
      const parsed = JSON.parse(msg);

      // After handshake response, send RegisterConnection + SearchHotels
      if (JSON.stringify(parsed) === '{}') {
        console.log('RECV: handshake OK\n');

        // Step 2: RegisterConnection
        const register = JSON.stringify({
          type: 1,
          target: 'RegisterConnection',
          arguments: [cacheKey]
        }) + RS;
        ws.send(register);
        console.log('SENT: RegisterConnection');

        // Step 3: SearchHotels
        const search = JSON.stringify({
          type: 1,
          target: 'SearchHotels',
          arguments: [cacheKey, {
            CheckIn: '2026-08-05',
            CheckOut: '2026-08-09',
            Code: '968',
            Type: 2,
            GuestNationality: '2',
            GuestNationalityName: 'EG',
            HotelPassenger: [{ adults: 1 }],
            City: 'DUBAI',
            Country: 'UNITED ARAB EMIRATES',
            HotelCodes: []
          }]
        }) + RS;
        ws.send(search);
        console.log('SENT: SearchHotels\n');
        return;
      }

      // Log incoming messages
      if (parsed.target) {
        const args = JSON.stringify(parsed.arguments || []).slice(0, 200);
        console.log(`RECV [${parsed.target}]: ${args}`);
      } else if (parsed.type === 6) {
        // Ping — respond with pong
        ws.send(JSON.stringify({ type: 6 }) + RS);
      } else if (parsed.type === 7) {
        console.log('RECV: Server closing connection');
      } else {
        console.log('RECV:', msg.slice(0, 200));
      }
    } catch (e) {
      console.log('RECV (raw):', msg.slice(0, 200));
    }
  }
});

ws.on('close', (code, reason) => {
  console.log(`\nDisconnected: code=${code} reason=${reason || 'none'}`);
});

ws.on('error', (err) => {
  console.log('Error:', err.message);
});

// Auto-close after 60s
setTimeout(() => {
  console.log('\n--- 60s timeout, closing ---');
  ws.close();
  process.exit(0);
}, 60000);

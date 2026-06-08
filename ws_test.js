const { WebSocket } = require('ws');
const config = JSON.parse(require('fs').readFileSync('/tmp/ha_test.json', 'utf8'));
const HA_URL = config.url;
const HA_TOKEN = config.token;
const protocol = HA_URL.startsWith('https') ? 'wss' : 'ws';
const wsUrl = protocol + '://' + HA_URL.replace(/^https?:\/\//, '') + '/api/websocket';
console.log('Connecting to:', wsUrl);

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('Connected, sending auth...');
  ws.send(JSON.stringify({ type: 'auth', access_token: HA_TOKEN }));
});

ws.on('message', (data) => {
  const parsed = JSON.parse(data.toString());
  console.log('WS response type:', parsed.type);

  if (parsed.type === 'auth_ok') {
    console.log('Auth OK! Sending statistics request...');
    ws.send(JSON.stringify({
      id: 1,
      type: 'recorder/statistics_during_period',
      start_time: '2026-06-06T16:00:00Z',
      end_time: '2026-06-06T17:00:00Z',
      statistic_ids: ['sensor.aw_2_hourly_rain'],
      period: '5minute',
    }));
  } else if (parsed.id === 1) {
    console.log('RESULT received');
    if (parsed.error) {
      console.log('ERROR:', JSON.stringify(parsed.error));
    } else if (parsed.result) {
      const keys = Object.keys(parsed.result);
      console.log('Keys in result:', keys);
      const rainStats = parsed.result['sensor.aw_2_hourly_rain'];
      if (rainStats && rainStats.length > 0) {
        console.log('Stats for sensor.aw_2_hourly_rain: ' + rainStats.length + ' entries');
        rainStats.forEach((s, i) => {
          console.log('  ' + i + ': start=' + s.start + ' sum=' + s.sum + ' min=' + s.min + ' max=' + s.max + ' state=' + s.state + ' meta=' + JSON.stringify(s.meta));
        });
      } else {
        console.log('No stats found for this sensor');
        keys.forEach(k => {
          console.log('  ' + k + ': ' + (Array.isArray(parsed.result[k]) ? parsed.result[k].length + ' entries' : typeof parsed.result[k]));
        });
      }
    }
    ws.close();
  } else if (parsed.type === 'auth_invalid') {
    console.log('Auth invalid:', parsed.message);
    ws.close();
  } else if (parsed.type === 'error') {
    console.log('WS error:', JSON.stringify(parsed.error || parsed));
    ws.close();
  }
});

ws.on('error', (err) => {
  console.log('WebSocket error:', err.message);
});

ws.on('close', (code, reason) => {
  console.log('WebSocket closed:', code, reason.toString());
});

setTimeout(() => {
  console.log('Timeout');
  ws.terminate();
  process.exit(1);
}, 20000);

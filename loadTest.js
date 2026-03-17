const signalR = require('@microsoft/signalr');
const axios = require('axios');
const { program } = require('commander');
const WebSocket = require('ws');
const config = require('./config');

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}

// ──────────────────────────────────────────────────────────────
//  CLI
// ──────────────────────────────────────────────────────────────
program
  .name('hotel-loadtest')
  .description('Load-test hotel search via HTTP + SignalR WebSocket')
  .option('-p, --providers <list>', 'Comma-separated providers or "all"', 'all')
  .option('-u, --users <n>', 'Concurrent users (flat mode)', parseInt)
  .option('--ramp-start <n>', 'Ramp-up: starting users', parseInt)
  .option('--ramp-end <n>', 'Ramp-up: ending users', parseInt)
  .option('--ramp-duration <sec>', 'Ramp-up: total duration in seconds', parseInt)
  .option('--ramp-step <sec>', 'Ramp-up: seconds between steps', parseInt)
  .option('--timeout <ms>', 'Per-search timeout in ms', parseInt)
  .parse();

const opts = program.opts();

function resolveProviders() {
  if (opts.providers === 'all') return [...config.providers];
  return opts.providers.split(',').map(p => p.trim());
}

// ──────────────────────────────────────────────────────────────
//  METRICS COLLECTOR
// ──────────────────────────────────────────────────────────────
class MetricsCollector {
  constructor() {
    this.sessions = [];
    this.providerStats = {};
    config.providers.forEach(p => {
      this.providerStats[p] = { times: [], hotels: 0, errors: 0 };
    });
  }

  addSession(s) {
    this.sessions.push(s);
  }

  addProviderResult(provider, ms, hotels) {
    const s = this.providerStats[provider];
    if (!s) return;
    s.times.push(ms);
    s.hotels += hotels;
  }

  addProviderError(provider) {
    const s = this.providerStats[provider];
    if (s) s.errors++;
  }

  _percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  _avg(arr) {
    return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  }

  _min(arr) { return arr.length ? Math.min(...arr) : 0; }
  _max(arr) { return arr.length ? Math.max(...arr) : 0; }

  report() {
    const total = this.sessions.length;
    const ok = this.sessions.filter(s => s.status === 'complete').length;
    const timeouts = this.sessions.filter(s => s.status === 'timeout').length;
    const errors = this.sessions.filter(s => s.status === 'error').length;
    const elapsed = this.sessions.map(s => s.elapsed);

    const line = '─'.repeat(78);
    const dblLine = '═'.repeat(78);

    console.log(`\n${dblLine}`);
    console.log('  LOAD TEST REPORT');
    console.log(dblLine);

    console.log(`\n  Total searches .... ${total}`);
    console.log(`  Successful ....... ${ok}  (${pct(ok, total)})`);
    console.log(`  Timed-out ........ ${timeouts}  (${pct(timeouts, total)})`);
    console.log(`  Errors ........... ${errors}  (${pct(errors, total)})`);

    if (elapsed.length) {
      console.log(`\n  Overall response time (ms)`);
      console.log(`    Avg: ${this._avg(elapsed)}   Min: ${this._min(elapsed)}   Max: ${this._max(elapsed)}   P95: ${this._percentile(elapsed, 95)}`);
    }

    console.log(`\n${line}`);
    console.log('  PER-PROVIDER BREAKDOWN');
    console.log(line);
    console.log(
      pad('Provider', 14) +
      pad('Avg ms', 10) +
      pad('Min', 10) +
      pad('Max', 10) +
      pad('P95', 10) +
      pad('Hotels', 10) +
      pad('Errors', 8)
    );
    console.log(line);

    for (const [name, s] of Object.entries(this.providerStats)) {
      if (!s.times.length && !s.errors) continue;
      console.log(
        pad(name, 14) +
        pad(this._avg(s.times), 10) +
        pad(this._min(s.times), 10) +
        pad(this._max(s.times), 10) +
        pad(this._percentile(s.times, 95), 10) +
        pad(s.hotels, 10) +
        pad(s.errors, 8)
      );
    }
    console.log(line);

    if (errors) {
      console.log('\n  ERRORS:');
      this.sessions
        .filter(s => s.status === 'error')
        .forEach(s => console.log(`    Session #${s.id}: ${s.error}`));
    }

    console.log(`\n${dblLine}\n`);
  }
}

function pct(n, total) {
  return total ? `${((n / total) * 100).toFixed(1)}%` : '0%';
}

function pad(v, w) {
  return String(v).padEnd(w);
}

// ──────────────────────────────────────────────────────────────
//  SINGLE SEARCH SESSION
// ──────────────────────────────────────────────────────────────
async function runSearch(sessionId, providers, metrics) {
  const t0 = Date.now();
  let connection = null;
  const searchKey = config.generateKey();

  try {
    // 1. Build SignalR connection
    connection = new signalR.HubConnectionBuilder()
      .withUrl(config.hubUrl, {
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets,
      })
      .configureLogging(signalR.LogLevel.None)
      .build();

    const pending = new Set(providers);
    const providerResults = {};

    const result = await new Promise(async (resolve) => {
      const timeoutMs = opts.timeout || config.searchTimeoutMs;
      const timer = setTimeout(() => {
        resolve({
          id: sessionId,
          status: 'timeout',
          providers: providerResults,
          elapsed: Date.now() - t0,
        });
      }, timeoutMs);

      // Listen for per-provider results
      connection.on(config.signalr.receiveMethod, (data) => {
        const provider =
          data?.provider || data?.ProviderName || data?.providerName || 'unknown';
        const hotels =
          data?.hotels?.length ?? data?.Hotels?.length ?? data?.hotelCount ?? 0;
        const ms = Date.now() - t0;

        providerResults[provider] = { ms, hotels, status: 'ok' };
        metrics.addProviderResult(provider, ms, hotels);
        pending.delete(provider);

        log(sessionId, `${provider}: ${hotels} hotels in ${ms} ms`);

        if (pending.size === 0) {
          clearTimeout(timer);
          resolve({
            id: sessionId,
            status: 'complete',
            providers: providerResults,
            elapsed: Date.now() - t0,
          });
        }
      });

      connection.on(config.signalr.searchCompleteMethod, () => {
        clearTimeout(timer);
        resolve({
          id: sessionId,
          status: 'complete',
          providers: providerResults,
          elapsed: Date.now() - t0,
        });
      });

      connection.on(config.signalr.errorMethod, (err) => {
        const msg = typeof err === 'string' ? err : JSON.stringify(err);
        log(sessionId, `Server error: ${msg}`);
      });

      // 2. Start SignalR connection
      await connection.start();
      const connMs = Date.now() - t0;
      log(sessionId, `Connected in ${connMs} ms  (connId: ${connection.connectionId})`);

      // 3. Fire HTTP POST to /api/Hotel/HotelResultDetails/:cacheKey/:key
      const url = `${config.searchEndpoint}/${searchKey}`;
      const body = {
        ...config.searchPayload,
        key: searchKey,
      };

      try {
        await axios.post(url, body, {
          headers: { 'Content-Type': 'application/json' },
          timeout: config.connectionTimeoutMs,
        });
        log(sessionId, `Search POST sent  (key: ${searchKey})`);
      } catch (httpErr) {
        clearTimeout(timer);
        resolve({
          id: sessionId,
          status: 'error',
          error: `HTTP ${httpErr.response?.status || ''}: ${httpErr.message}`,
          providers: providerResults,
          elapsed: Date.now() - t0,
        });
      }
    });

    metrics.addSession(result);
    return result;
  } catch (err) {
    const result = {
      id: sessionId,
      status: 'error',
      error: err.message,
      providers: {},
      elapsed: Date.now() - t0,
    };
    metrics.addSession(result);
    log(sessionId, `ERROR: ${err.message}`);
    return result;
  } finally {
    if (connection) {
      try { await connection.stop(); } catch (_) { /* ignore */ }
    }
  }
}

function log(sessionId, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`  [${ts}] Session #${sessionId}  ${msg}`);
}

// ──────────────────────────────────────────────────────────────
//  LOAD-TEST MODES
// ──────────────────────────────────────────────────────────────

async function concurrentMode(providers, metrics) {
  const users = opts.users || config.defaults.users;
  console.log(`\n  Mode ........... Concurrent`);
  console.log(`  Users .......... ${users}\n`);

  const promises = [];
  for (let i = 1; i <= users; i++) {
    promises.push(runSearch(i, providers, metrics));
  }
  return Promise.all(promises);
}

async function rampUpMode(providers, metrics) {
  const start = opts.rampStart ?? config.defaults.rampStart;
  const end = opts.rampEnd ?? config.defaults.rampEnd;
  const duration = opts.rampDuration ?? config.defaults.rampDurationSec;
  const step = opts.rampStep ?? config.defaults.rampStepSec;

  const steps = Math.max(1, Math.ceil(duration / step));
  const increment = (end - start) / steps;
  let sessionId = 0;

  console.log(`\n  Mode ........... Ramp-up`);
  console.log(`  Users .......... ${start} -> ${end}`);
  console.log(`  Duration ....... ${duration}s  (step every ${step}s)`);
  console.log(`  Steps .......... ${steps + 1}\n`);

  for (let s = 0; s <= steps; s++) {
    const users = Math.min(Math.round(start + increment * s), end);
    console.log(`\n  -- Step ${s + 1}/${steps + 1}: ${users} concurrent users --`);

    const batch = [];
    for (let i = 0; i < users; i++) {
      sessionId++;
      batch.push(runSearch(sessionId, providers, metrics));
    }
    await Promise.all(batch);

    if (s < steps) {
      console.log(`  ... waiting ${step}s before next step ...\n`);
      await sleep(step * 1000);
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ──────────────────────────────────────────────────────────────
//  MAIN
// ──────────────────────────────────────────────────────────────
async function main() {
  const providers = resolveProviders();
  const isRamp = opts.rampEnd != null;

  const banner = '='.repeat(78);
  console.log(`\n${banner}`);
  console.log('  HOTEL SEARCH LOAD TEST');
  console.log(banner);
  console.log(`  Hub URL ........ ${config.hubUrl}`);
  console.log(`  Search API ..... ${config.searchEndpoint}/:key`);
  console.log(`  Providers ...... ${providers.join(', ')}`);
  console.log(`  Timeout ........ ${opts.timeout || config.searchTimeoutMs} ms`);

  const metrics = new MetricsCollector();

  if (isRamp) {
    await rampUpMode(providers, metrics);
  } else {
    await concurrentMode(providers, metrics);
  }

  metrics.report();
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});

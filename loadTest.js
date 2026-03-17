const signalR = require('@microsoft/signalr');
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
  .description('Load-test hotel search via SignalR hubs')
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
  }

  addSession(s) { this.sessions.push(s); }

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

  _statLine(label, arr) {
    if (!arr.length) return null;
    return (
      pad(label, 30) +
      pad(this._avg(arr), 12) +
      pad(this._min(arr), 12) +
      pad(this._max(arr), 12) +
      pad(this._percentile(arr, 95), 12)
    );
  }

  report() {
    const total = this.sessions.length;
    const ok = this.sessions.filter(s => s.status === 'complete').length;
    const timeouts = this.sessions.filter(s => s.status === 'timeout').length;
    const errors = this.sessions.filter(s => s.status === 'error').length;
    const elapsed = this.sessions.map(s => s.elapsed);

    const line = '-'.repeat(78);
    const dblLine = '='.repeat(78);

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
    console.log('  TIMING BREAKDOWN');
    console.log(line);
    console.log(
      pad('Metric', 30) + pad('Avg ms', 12) + pad('Min', 12) + pad('Max', 12) + pad('P95', 12)
    );
    console.log(line);

    const timings = [
      ['Hub connect', 'connectTime'],
      ['RegisterConnection', 'registerTime'],
      ['PricesHub connect', 'pricesConnectTime'],
      ['First page results', 'firstPageTime'],
      ['Search finished', 'finishTime'],
    ];

    for (const [label, key] of timings) {
      const arr = this.sessions.map(s => s[key]).filter(Boolean);
      const l = this._statLine(label, arr);
      if (l) console.log(l);
    }

    console.log(line);

    if (errors) {
      console.log('\n  ERRORS:');
      this.sessions
        .filter(s => s.status === 'error')
        .forEach(s => console.log(`    Session #${s.id}: ${s.error}`));
    }

    const hotelCounts = this.sessions.map(s => s.totalHotels).filter(Boolean);
    if (hotelCounts.length) {
      console.log(`\n  Hotels found:  Avg: ${this._avg(hotelCounts)}   Min: ${this._min(hotelCounts)}   Max: ${this._max(hotelCounts)}`);
    }

    const pageCounts = this.sessions.map(s => s.pageCount).filter(Boolean);
    if (pageCounts.length) {
      console.log(`  Total pages:   Avg: ${this._avg(pageCounts)}   Min: ${this._min(pageCounts)}   Max: ${this._max(pageCounts)}`);
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
//  Replicates exact browser flow from signal-r.service.ts:
//    1. Connect searchHub with accessToken
//    2. Invoke RegisterConnection(cacheKey)
//    3. After register completes → start pricesHub
//    4. Listen for results on searchHub
// ──────────────────────────────────────────────────────────────
async function runSearch(sessionId, providers, metrics) {
  const t0 = Date.now();
  let searchHub = null;
  let pricesHub = null;
  const cacheKey = config.generateCacheKey();

  const session = {
    id: sessionId,
    status: 'pending',
    connectTime: 0,
    registerTime: 0,
    pricesConnectTime: 0,
    firstPageTime: 0,
    finishTime: 0,
    totalHotels: 0,
    pageCount: 0,
    elapsed: 0,
    error: null,
  };

  try {
    const result = await new Promise(async (resolve) => {
      const timeoutMs = opts.timeout || config.searchTimeoutMs;
      const timer = setTimeout(() => {
        session.status = 'timeout';
        session.elapsed = Date.now() - t0;
        resolve(session);
      }, timeoutMs);

      function finish(status, error) {
        clearTimeout(timer);
        session.status = status;
        session.elapsed = Date.now() - t0;
        if (error) session.error = error;
        resolve(session);
      }

      // Step 1: Connect searchHub WITH accessToken (like the browser does)
      searchHub = new signalR.HubConnectionBuilder()
        .withUrl(config.searchHubUrl, {
          transport: signalR.HttpTransportType.WebSockets,
          accessTokenFactory: () => config.tempToken,
        })
        .configureLogging(signalR.LogLevel.None)
        .build();

      // Listen: first page (note: server has typo "Firt")
      searchHub.on(config.signalr.receiveFirstPage, (result) => {
        const ms = Date.now() - t0;
        session.firstPageTime = ms;
        const data = typeof result === 'string' ? JSON.parse(result) : result;
        session.totalHotels = data?.hotelResults?.length ?? 0;
        log(sessionId, `First page: ${session.totalHotels} hotels in ${ms} ms`);
      });

      searchHub.on(config.signalr.countUpdated, (result) => {
        const data = typeof result === 'string' ? JSON.parse(result) : result;
        session.pageCount = data?.pageCount ?? session.pageCount;
      });

      searchHub.on(config.signalr.searchFinished, (summary) => {
        const ms = Date.now() - t0;
        session.finishTime = ms;
        try {
          const data = typeof summary === 'string' ? JSON.parse(summary) : summary;
          session.pageCount = data?.pageCount ?? session.pageCount;
        } catch (_) {}
        log(sessionId, `FINISHED: ${session.pageCount} pages in ${ms} ms`);
        finish('complete');
      });

      searchHub.on(config.signalr.receiveMessage, (msg) => {
        log(sessionId, `Server: ${msg}`);
      });

      searchHub.on(config.signalr.errorOccured, (err) => {
        log(sessionId, `Error: ${err}`);
      });

      // Step 1: Start connection
      await searchHub.start();
      session.connectTime = Date.now() - t0;
      log(sessionId, `Connected in ${session.connectTime} ms`);

      // Step 2: RegisterConnection
      try {
        await searchHub.invoke(config.signalr.registerMethod, cacheKey);
        session.registerTime = Date.now() - t0;
        log(sessionId, `Registered: ${cacheKey.slice(0, 8)}...`);
      } catch (err) {
        finish('error', `RegisterConnection failed: ${err.message}`);
        return;
      }

      // Step 3: AFTER register completes → start pricesHub (exact browser order)
      pricesHub = new signalR.HubConnectionBuilder()
        .withUrl(config.pricesHubUrl(cacheKey), {
          skipNegotiation: false,
        })
        .configureLogging(signalR.LogLevel.None)
        .build();

      pricesHub.on('Send', () => {});

      try {
        await pricesHub.start();
        session.pricesConnectTime = Date.now() - t0;
        log(sessionId, `PricesHub started in ${session.pricesConnectTime} ms`);
      } catch (err) {
        log(sessionId, `PricesHub failed: ${err.message} (continuing)`);
      }
    });

    metrics.addSession(result);
    return result;
  } catch (err) {
    session.status = 'error';
    session.error = err.message;
    session.elapsed = Date.now() - t0;
    metrics.addSession(session);
    log(sessionId, `ERROR: ${err.message}`);
    return session;
  } finally {
    if (searchHub) { try { await searchHub.stop(); } catch (_) {} }
    if (pricesHub) { try { await pricesHub.stop(); } catch (_) {} }
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
  if (config.tempToken === 'PUT_YOUR_TEMP_TOKEN_HERE') {
    console.error('\n  ERROR: You must set tempToken in config.js first!');
    console.error('  Get it from browser localStorage/sessionStorage or DevTools console.\n');
    process.exit(1);
  }

  const providers = resolveProviders();
  const isRamp = opts.rampEnd != null;

  const banner = '='.repeat(78);
  console.log(`\n${banner}`);
  console.log('  HOTEL SEARCH LOAD TEST');
  console.log(banner);
  console.log(`  SearchHub ...... ${config.searchHubUrl}`);
  console.log(`  Token .......... ${config.tempToken.slice(0, 20)}...`);
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

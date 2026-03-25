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
  .option('--city <code>', 'Destination code (25270=Dubai, 4=Egypt)')
  .option('--checkin <date>', 'Check-in date YYYY-MM-DD')
  .option('--checkout <date>', 'Check-out date YYYY-MM-DD')
  .option('--pages <n>', 'Number of pages to fetch (0=first page only)', parseInt, 0)
  .parse();

const opts = program.opts();

function resolveProviders() {
  if (opts.providers === 'all') return [...config.providers];
  return opts.providers.split(',').map(p => p.trim());
}

function buildSearchPayload(providers) {
  const payload = { ...config.searchPayload };
  if (opts.city) payload.Code = opts.city;
  if (opts.checkin) payload.CheckIn = opts.checkin;
  if (opts.checkout) payload.CheckOut = opts.checkout;
  if (providers && !providers.includes('all')) {
    payload.Providers = providers;
  }
  return payload;
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
    console.log(pad('Metric', 30) + pad('Avg ms', 12) + pad('Min', 12) + pad('Max', 12) + pad('P95', 12));
    console.log(line);

    const timings = [
      ['Hub connect', 'connectTime'],
      ['RegisterConnection', 'registerTime'],
      ['SearchHotels invoke', 'searchInvokeTime'],
      ['Reconnect', 'reconnectTime'],
      ['First page results', 'firstPageTime'],
      ['Search finished', 'finishTime'],
    ];

    for (const [label, key] of timings) {
      const arr = this.sessions.map(s => s[key]).filter(Boolean);
      if (!arr.length) continue;
      console.log(
        pad(label, 30) +
        pad(this._avg(arr), 12) +
        pad(this._min(arr), 12) +
        pad(this._max(arr), 12) +
        pad(this._percentile(arr, 95), 12)
      );
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
//
//  Complete flow (from hub documentation):
//    1. Connect searchHub with accessToken
//    2. RegisterConnection(cacheKey)
//    3. SearchHotels(cacheKey, searchPayload)  ← triggers the search
//    4. Wait for ErrorOccured → reconnect to get cached results
//    5. Listen for results
// ──────────────────────────────────────────────────────────────

function buildHubOptions() {
  const opts = {
    skipNegotiation: true,
    transport: signalR.HttpTransportType.WebSockets,
  };
  if (config.tempToken) {
    opts.accessTokenFactory = () => config.tempToken;
  }
  if (config.apiKey && config.apiKeyHeader) {
    opts.headers = opts.headers || {};
    opts.headers[config.apiKeyHeader] = config.apiKey;
  }
  if (config.authCookie) {
    opts.headers = opts.headers || {};
    opts.headers['Cookie'] = config.authCookie;
  }
  return opts;
}

function createHub(url) {
  return new signalR.HubConnectionBuilder()
    .withUrl(url, buildHubOptions())
    .configureLogging(signalR.LogLevel.None)
    .build();
}

function attachListeners(hub, sessionId, session, t0, finish) {
  hub.on(config.signalr.receiveFirstPage, (result) => {
    const ms = Date.now() - t0;
    session.firstPageTime = ms;
    const data = typeof result === 'string' ? JSON.parse(result) : result;
    const hotels = data?.hotelResults?.length ?? 0;
    session.totalHotels += hotels;
    log(sessionId, `First page: ${hotels} hotels in ${ms} ms`);
  });

  hub.on(config.signalr.paginationResults, (result) => {
    const data = typeof result === 'string' ? JSON.parse(result) : result;
    const hotels = data?.hotelResults?.length ?? 0;
    session.totalHotels += hotels;
    log(sessionId, `Page result: +${hotels} hotels (total: ${session.totalHotels})`);
  });

  hub.on(config.signalr.countUpdated, (result) => {
    const data = typeof result === 'string' ? JSON.parse(result) : result;
    session.pageCount = data?.pageCount ?? session.pageCount;
  });

  hub.on(config.signalr.searchFinished, (summary) => {
    const ms = Date.now() - t0;
    session.finishTime = ms;
    try {
      const data = typeof summary === 'string' ? JSON.parse(summary) : summary;
      session.pageCount = data?.pageCount ?? session.pageCount;
    } catch (_) {}
    log(sessionId, `FINISHED: ${session.totalHotels} hotels, ${session.pageCount} pages in ${ms} ms`);
    session.searchDone = true;
  });

  hub.on(config.signalr.receiveMessage, (msg) => {
    log(sessionId, `Server: ${msg}`);
  });
}

async function runSearch(sessionId, providers, metrics, searchPayload) {
  const t0 = Date.now();
  let searchHub = null;
  const cacheKey = config.generateCacheKey();

  const session = {
    id: sessionId,
    status: 'pending',
    connectTime: 0,
    registerTime: 0,
    searchInvokeTime: 0,
    reconnectTime: 0,
    firstPageTime: 0,
    finishTime: 0,
    totalHotels: 0,
    pageCount: 0,
    searchDone: false,
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

      // ── Phase 1: Connect, Register, Search ─────────────────
      searchHub = createHub(`${config.searchHubUrl}?cacheKey=${cacheKey}`);

      let errorFired = false;
      searchHub.on(config.signalr.errorOccured, () => { errorFired = true; });
      attachListeners(searchHub, sessionId, session, t0, finish);

      await searchHub.start();
      session.connectTime = Date.now() - t0;
      log(sessionId, `Connected in ${session.connectTime} ms`);

      await searchHub.send(config.signalr.registerConnection, cacheKey);
      session.registerTime = Date.now() - t0;
      log(sessionId, `Registered: ${cacheKey}`);

      await new Promise(r => setTimeout(r, 300));

      await searchHub.send(config.signalr.searchHotels, cacheKey, searchPayload);
      session.searchInvokeTime = Date.now() - t0;
      log(sessionId, `SearchHotels sent (Code=${searchPayload.Code})`);

      // ── Phase 2: Wait for ErrorOccured → reconnect if needed ─
      await new Promise(r => setTimeout(r, 5000));

      if (errorFired && session.status === 'pending') {
        log(sessionId, `ErrorOccured detected, reconnecting...`);
        try { await searchHub.stop(); } catch (_) {}
        await new Promise(r => setTimeout(r, 3000));

        searchHub = createHub(`${config.searchHubUrl}?cacheKey=${cacheKey}`);
        attachListeners(searchHub, sessionId, session, t0, finish);

        await searchHub.start();
        await searchHub.send(config.signalr.registerConnection, cacheKey);
        session.reconnectTime = Date.now() - t0;
        log(sessionId, `Reconnected and re-registered`);
      }

      // ── Phase 3: Wait for search to finish ─────────────────
      while (!session.searchDone && (Date.now() - t0) < timeoutMs) {
        await new Promise(r => setTimeout(r, 1000));
      }

      // ── Phase 4: Fetch additional pages if requested ───────
      const pagesToFetch = opts.pages || 0;
      if (pagesToFetch > 0 && session.pageCount > 1 && session.status !== 'timeout') {
        const maxPage = Math.min(pagesToFetch + 1, session.pageCount);
        log(sessionId, `Fetching pages 2-${maxPage} of ${session.pageCount}...`);
        for (let page = 2; page <= maxPage; page++) {
          try {
            await searchHub.send(config.signalr.nextPage, cacheKey, page, searchPayload.CheckIn);
            await new Promise(r => setTimeout(r, 1500));
          } catch (e) {
            log(sessionId, `NextPage(${page}) failed: ${e.message}`);
            break;
          }
        }
        await new Promise(r => setTimeout(r, 2000));
        log(sessionId, `Pagination done: ${session.totalHotels} total hotels`);
      }

      if (session.status === 'pending') {
        finish('complete');
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
  }
}

function log(sessionId, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`  [${ts}] Session #${sessionId}  ${msg}`);
}

// ──────────────────────────────────────────────────────────────
//  LOAD-TEST MODES
// ──────────────────────────────────────────────────────────────
async function concurrentMode(providers, metrics, searchPayload) {
  const users = opts.users || config.defaults.users;
  console.log(`\n  Mode ........... Concurrent`);
  console.log(`  Users .......... ${users}\n`);

  const promises = [];
  for (let i = 1; i <= users; i++) {
    promises.push(runSearch(i, providers, metrics, searchPayload));
  }
  return Promise.all(promises);
}

async function rampUpMode(providers, metrics, searchPayload) {
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
      batch.push(runSearch(sessionId, providers, metrics, searchPayload));
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
  const hasAuth = !!(config.tempToken || config.apiKey || config.authCookie);
  if (!hasAuth) {
    console.log('\n  WARNING: No authentication configured in config.js');
    console.log('  SearchHotels may fail with ErrorOccured on remote servers.');
    console.log('  Ask your developer which auth method to use (see config.js comments).\n');
  }

  const providers = resolveProviders();
  const searchPayload = buildSearchPayload(providers);
  const isRamp = opts.rampEnd != null;

  const banner = '='.repeat(78);
  console.log(`\n${banner}`);
  console.log('  HOTEL SEARCH LOAD TEST');
  console.log(banner);
  const authType = config.tempToken ? 'Bearer Token' : config.apiKey ? `API Key (${config.apiKeyHeader})` : config.authCookie ? 'Cookie' : 'NONE';
  console.log(`  Hub ............ ${config.searchHubUrl}`);
  console.log(`  Auth ........... ${authType}`);
  console.log(`  Destination .... ${searchPayload.City} (Code: ${searchPayload.Code})`);
  console.log(`  Dates .......... ${searchPayload.CheckIn} -> ${searchPayload.CheckOut}`);
  console.log(`  Providers ...... ${providers.join(', ')}`);
  console.log(`  Pages .......... ${opts.pages ? opts.pages : 'first page only'}`);
  console.log(`  Users .......... ${opts.users || config.defaults.users}`);
  console.log(`  Timeout ........ ${opts.timeout || config.searchTimeoutMs} ms`);

  const metrics = new MetricsCollector();

  if (isRamp) {
    await rampUpMode(providers, metrics, searchPayload);
  } else {
    await concurrentMode(providers, metrics, searchPayload);
  }

  metrics.report();
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});

# Hotel Search Load Test

Load-testing tool for hotel search via **SignalR WebSocket** with multi-provider support.

## Providers

| Provider   | Key         |
|------------|-------------|
| TBO        | `TBO`       |
| Webbeds    | `Webbeds`   |
| Hotelbeds  | `hotelbeds` |
| RateHawk   | `ratehawk`  |
| Magic      | `magic`     |
| Smile      | `smile`     |

## Setup

```bash
npm install
```

Edit **`config.js`** and set:
- `auth.apiKey` — your API key
- `searchEndpoint` — the HTTP endpoint that triggers hotel search
- `signalr.receiveMethod` — the SignalR method name the server uses to push results
- `searchPayload` — default search parameters (destination, dates, rooms, etc.)

## Usage

### Test all providers (concurrent)

```bash
node loadtest.js --providers all --users 10
```

### Test a single provider

```bash
node loadtest.js --providers TBO --users 5
```

### Test multiple specific providers

```bash
node loadtest.js --providers TBO,Webbeds,hotelbeds --users 5
```

### Ramp-up mode

Gradually increase concurrent users from 1 to 50 over 120 seconds, stepping every 10 seconds:

```bash
node loadtest.js --providers all --ramp-start 1 --ramp-end 50 --ramp-duration 120 --ramp-step 10
```

### Custom timeout

```bash
node loadtest.js --providers all --users 10 --timeout 60000
```

## CLI Options

| Flag                  | Description                              | Default        |
|-----------------------|------------------------------------------|----------------|
| `-p, --providers`     | Comma-separated providers or `all`       | `all`          |
| `-u, --users`         | Number of concurrent users (flat mode)   | `5`            |
| `--ramp-start`        | Ramp-up starting users                   | `1`            |
| `--ramp-end`          | Ramp-up ending users (enables ramp mode) | —              |
| `--ramp-duration`     | Ramp-up total duration in seconds        | `60`           |
| `--ramp-step`         | Seconds between ramp-up steps            | `10`           |
| `--timeout`           | Per-search timeout in milliseconds       | `120000`       |

## How It Works

1. **Connect** — Opens a SignalR WebSocket connection to the hub
2. **Search** — Sends an HTTP POST to the search endpoint with the connection ID and selected providers
3. **Listen** — Receives streamed results per provider through the SignalR hub
4. **Report** — Collects timing metrics and prints a summary with per-provider breakdown

## Output

The report includes:
- Total/successful/timeout/error counts
- Overall response time statistics (avg, min, max, P95)
- Per-provider breakdown: avg response time, min, max, P95, hotel count, errors

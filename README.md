# Hotel Search Load Test

Load-testing tool for hotel search via **SignalR WebSocket** with multi-provider support.

## Setup

```bash
npm install
```

### Authentication

1. Log in to the test website
2. Get your `tempToken` from the browser (DevTools Console / localStorage / sessionStorage)
3. Set it in `config.js`:

```javascript
tempToken: 'YOUR_TOKEN_HERE',
```

## How It Works

The tool replicates the exact browser SignalR flow:

```
1. Connect to /hubs/mobilehotelsearch (with accessToken)
2. Invoke RegisterConnection(cacheKey)
3. Invoke SearchHotels(cacheKey, searchPayload)  ← triggers the search
4. Connect to /hubs/hotelsearch/prices (with cacheKey)
5. Listen for streaming results:
   - ReceiveFirtPageHotelResult  → first batch of hotels
   - CountUpdated                → incremental provider updates
   - ReceiveHotelSearchFinished  → search complete
```

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

### Custom destination and dates

```bash
# Dubai (Code: 968)
node loadtest.js --city 968 --checkin 2026-08-05 --checkout 2026-08-09 --users 5

# Egypt (Code: 4)
node loadtest.js --city 4 --checkin 2026-08-05 --checkout 2026-08-09 --users 5
```

### Ramp-up mode

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
| `--city`              | Destination code (968=Dubai, 4=Egypt)    | `968`          |
| `--checkin`           | Check-in date YYYY-MM-DD                 | from config    |
| `--checkout`          | Check-out date YYYY-MM-DD               | from config    |
| `--ramp-start`        | Ramp-up starting users                   | `1`            |
| `--ramp-end`          | Ramp-up ending users (enables ramp mode) | —              |
| `--ramp-duration`     | Ramp-up total duration in seconds        | `60`           |
| `--ramp-step`         | Seconds between ramp-up steps            | `10`           |
| `--timeout`           | Per-search timeout in milliseconds       | `180000`       |

## Providers

| Provider   | Key         |
|------------|-------------|
| TBO        | `TBO`       |
| Webbeds    | `Webbeds`   |
| Hotelbeds  | `hotelbeds` |
| RateHawk   | `ratehawk`  |
| Magic      | `magic`     |
| Smile      | `smile`     |

## Report Output

- Total/successful/timeout/error counts
- Overall response time stats (avg, min, max, P95)
- Per-step timing: connect, register, SearchHotels, first page, finished
- Hotels found and total pages

module.exports = {
  // =================================================================
  //  CONNECTION
  // =================================================================
  baseUrl: 'https://alkhameescore.techeffic.com',
  hubPath: '/hubs/mobilehotelsearch',

  get hubUrl() {
    return `${this.baseUrl}${this.hubPath}`;
  },

  // HTTP endpoint that triggers the hotel search
  // TODO: Replace with actual search endpoint path
  searchEndpoint: 'https://alkhameescore.techeffic.com/api/hotel/search',

  // =================================================================
  //  AUTHENTICATION  (API Key)
  // =================================================================
  auth: {
    apiKey: 'YOUR_API_KEY_HERE',      // <-- PUT YOUR API KEY
    headerName: 'X-Api-Key',          // <-- Adjust if the header name differs
  },

  // =================================================================
  //  SIGNALR  –  Hub method names the server uses
  // =================================================================
  signalr: {
    // Method the server invokes to push results per provider
    receiveMethod: 'ReceiveSearchResults',

    // Method the server invokes when the full search is done
    searchCompleteMethod: 'SearchComplete',

    // Method the server invokes on error
    errorMethod: 'SearchError',
  },

  // =================================================================
  //  PROVIDERS
  // =================================================================
  providers: ['TBO', 'Webbeds', 'hotelbeds', 'ratehawk', 'magic', 'smile'],

  // =================================================================
  //  DEFAULT SEARCH PAYLOAD  (sent via HTTP POST)
  // =================================================================
  searchPayload: {
    destination: 'Dubai',
    destinationCode: 'DXB',
    countryCode: 'AE',
    nationality: 'SA',
    checkIn: '2026-04-15',
    checkOut: '2026-04-18',
    currency: 'SAR',
    rooms: [
      { adults: 2, children: 0, childAges: [] },
    ],
  },

  // =================================================================
  //  TIMEOUTS
  // =================================================================
  searchTimeoutMs: 120_000,
  connectionTimeoutMs: 30_000,

  // =================================================================
  //  LOAD-TEST DEFAULTS  (overridable via CLI flags)
  // =================================================================
  defaults: {
    users: 5,
    rampStart: 1,
    rampEnd: 10,
    rampDurationSec: 60,
    rampStepSec: 10,
  },
};

module.exports = {
  // =================================================================
  //  CONNECTION
  // =================================================================
  baseUrl: 'https://alkhameescore.techeffic.com',
  hubPath: '/hubs/mobilehotelsearch',

  get hubUrl() {
    return `${this.baseUrl}${this.hubPath}`;
  },

  // =================================================================
  //  AUTHENTICATION  (API Key)
  // =================================================================
  auth: {
    apiKey: 'YOUR_API_KEY_HERE',      // <-- PUT YOUR API KEY
    headerName: 'X-Api-Key',          // <-- Adjust if the header name differs
  },

  // =================================================================
  //  SIGNALR  –  Hub method names
  // =================================================================
  signalr: {
    // Method we INVOKE on the hub to start a search
    invokeMethod: 'Search',

    // Method the server calls to push results per provider
    receiveMethod: 'ReceiveSearchResults',

    // Method the server calls when the full search is done
    searchCompleteMethod: 'SearchComplete',

    // Method the server calls on error
    errorMethod: 'SearchError',
  },

  // =================================================================
  //  PROVIDERS
  // =================================================================
  providers: ['TBO', 'Webbeds', 'hotelbeds', 'ratehawk', 'magic', 'smile'],

  // =================================================================
  //  DEFAULT SEARCH PAYLOAD  (sent to the hub invoke method)
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

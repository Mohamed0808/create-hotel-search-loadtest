const crypto = require('crypto');

module.exports = {
  // =================================================================
  //  CONNECTION
  // =================================================================
  baseUrl: 'https://alkhameescore.techeffic.com',
  hubPath: '/hubs/mobilehotelsearch',

  // cacheKey — used in both the hub URL and the HTTP search endpoint
  // TODO: Put your actual cacheKey value
  cacheKey: 'YOUR_CACHE_KEY_HERE',

  get hubUrl() {
    return `${this.baseUrl}${this.hubPath}?cacheKey=${this.cacheKey}`;
  },

  // HTTP POST endpoint:  /api/Hotel/HotelResultDetails/:cacheKey/:key
  get searchEndpoint() {
    return `${this.baseUrl}/api/Hotel/HotelResultDetails/${this.cacheKey}`;
  },

  // Generates a unique key (GUID) per search session
  generateKey() {
    return crypto.randomUUID();
  },

  // =================================================================
  //  SIGNALR  –  Hub method names the server calls back
  // =================================================================
  signalr: {
    receiveMethod: 'ReceiveSearchResults',
    searchCompleteMethod: 'SearchComplete',
    errorMethod: 'SearchError',
  },

  // =================================================================
  //  PROVIDERS
  // =================================================================
  providers: ['TBO', 'Webbeds', 'hotelbeds', 'ratehawk', 'magic', 'smile'],

  // =================================================================
  //  SEARCH PAYLOAD  (POST body to /api/Hotel/HotelResultDetails)
  //  TODO: Replace with real values for your test scenario
  // =================================================================
  searchPayload: {
    checkIn: '2026-04-15T00:00:00.000Z',
    checkOut: '2026-04-18T00:00:00.000Z',
    code: 'DXB',
    type: 1,
    nationalityName: 'Saudi Arabia',
    nationality: 'SA',
    passengers: '2',
    city: 'Dubai',
    country: 'AE',
    rate: 'SAR',
    env: 'test',
    hotelCodes: [],
    hotelProviders: [
      {
        id: 1,
        name: 'TBO',
        giataCode: '',
        tboCode: '',
        webbedsCode: '',
        hotelbedsCode: '',
        rateHawkCode: '',
        offlineHotelId: 0,
        globalCityId: 0,
      },
    ],
    source: 'loadtest',
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

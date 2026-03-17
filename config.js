const crypto = require('crypto');

module.exports = {
  // =================================================================
  //  CONNECTION
  // =================================================================
  baseUrl: 'https://alkhameescore.techeffic.com',

  // SignalR hub — NO cacheKey in the URL (it's sent via RegisterConnection)
  hubUrl: 'https://alkhameescore.techeffic.com/hubs/mobilehotelsearch',

  // HTTP POST to trigger the search
  searchUrl(cacheKey, key) {
    return `${this.baseUrl}/api/Hotel/HotelResultDetails/${cacheKey}/${key}`;
  },

  generateCacheKey() {
    return crypto.randomUUID();
  },

  generateKey() {
    return crypto.randomUUID();
  },

  // =================================================================
  //  SIGNALR METHOD NAMES
  // =================================================================
  signalr: {
    // Client invokes to register for results
    registerMethod: 'RegisterConnection',

    // Server pushes first page of hotel results
    receiveFirstPage: 'ReceiveFirstPageHotelResult',

    // Server pushes incremental count updates per provider
    countUpdated: 'CountUpdated',

    // Server signals search is finished
    searchFinished: 'ReceiveHotelSearchFinished',

    // Server sends status messages
    receiveMessage: 'ReceiveMessage',
  },

  // =================================================================
  //  PROVIDERS
  // =================================================================
  providers: ['TBO', 'Webbeds', 'hotelbeds', 'ratehawk', 'magic', 'smile'],

  // =================================================================
  //  SEARCH PAYLOAD  (POST body to /api/Hotel/HotelResultDetails)
  //  TODO: Replace with real values from a working Postman request
  // =================================================================
  searchPayload: {
    checkIn: '2026-04-15T00:00:00.000Z',
    checkOut: '2026-04-18T00:00:00.000Z',
    code: '25270',
    type: 2,
    nationalityName: 'Egyptian',
    nationality: 'EG',
    passengers: '2',
    city: 'Dubai',
    country: 'AE',
    rate: 'EGP',
    env: 'test',
    hotelCodes: [],
    hotelProviders: [],
    source: 'loadtest',
  },

  // =================================================================
  //  TIMEOUTS
  // =================================================================
  searchTimeoutMs: 180_000,
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

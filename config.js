const crypto = require('crypto');

module.exports = {
  // =================================================================
  //  CONNECTION
  // =================================================================
  baseUrl: 'https://alkhameescore.techeffic.com',
  searchHubUrl: 'https://alkhameescore.techeffic.com/hubs/mobilehotelsearch',

  pricesHubUrl(cacheKey) {
    return `https://alkhameescore.techeffic.com/hubs/hotelsearch/prices?cacheKey=${cacheKey}`;
  },

  generateCacheKey() {
    return crypto.randomUUID();
  },

  // =================================================================
  //  AUTHENTICATION
  //  Put your tempToken here (get it from browser console/localStorage)
  // =================================================================
  tempToken: 'PUT_YOUR_TEMP_TOKEN_HERE',

  // =================================================================
  //  SIGNALR METHOD NAMES  (exact names from source code)
  // =================================================================
  signalr: {
    registerMethod: 'RegisterConnection',
    receiveFirstPage: 'ReceiveFirtPageHotelResult',   // typo is intentional — matches server
    countUpdated: 'CountUpdated',
    searchFinished: 'ReceiveHotelSearchFinished',
    receiveMessage: 'ReceiveMessage',
    paginationResults: 'ReceivePaginationResults',
    filteredResult: 'ReceiveFilteredResult',
    errorOccured: 'ErrorOccured',                      // typo is intentional — matches server
  },

  // =================================================================
  //  PROVIDERS
  // =================================================================
  providers: ['TBO', 'Webbeds', 'hotelbeds', 'ratehawk', 'magic', 'smile'],

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

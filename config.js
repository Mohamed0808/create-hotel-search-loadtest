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
    return String(Date.now()) + String(Math.floor(Math.random() * 10000));
  },

  // =================================================================
  //  AUTHENTICATION
  //  ← PUT YOUR tempToken HERE (get it from browser)
  // =================================================================
  tempToken: 'PUT_YOUR_TEMP_TOKEN_HERE',

  // =================================================================
  //  SIGNALR HUB METHODS  (from documentation)
  // =================================================================
  signalr: {
    // Client invokes
    registerConnection: 'RegisterConnection',
    searchHotels: 'SearchHotels',
    nextPage: 'NextPage',
    filter: 'Filter',

    // Server pushes (method names from source code — typos are intentional)
    receiveFirstPage: 'ReceiveFirtPageHotelResult',
    countUpdated: 'CountUpdated',
    searchFinished: 'ReceiveHotelSearchFinished',
    receiveMessage: 'ReceiveMessage',
    paginationResults: 'ReceivePaginationResults',
    filteredResult: 'ReceiveFilteredResult',
    errorOccured: 'ErrorOccured',
  },

  // =================================================================
  //  SEARCH PARAMETERS
  //  Destination codes:  "4" = Egypt,  "968" = Dubai
  // =================================================================
  searchPayload: {
    CheckIn: '2026-08-05',
    CheckOut: '2026-08-09',
    Code: '968',
    Type: 2,
    GuestNationality: '2',
    GuestNationalityName: 'EG',
    HotelPassenger: [{ adults: 1 }],
    City: 'DUBAI',
    Country: 'UNITED ARAB EMIRATES',
    HotelCodes: [],
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

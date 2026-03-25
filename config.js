module.exports = {
  // =================================================================
  //  CONNECTION
  // =================================================================
  baseUrl: 'https://alkhameescore.techeffic.com',

  get searchHubUrl() {
    return `${this.baseUrl}/hubs/mobilehotelsearch`;
  },

  pricesHubUrl(cacheKey) {
    return `${this.baseUrl}/hubs/hotelsearch/prices?cacheKey=${cacheKey}`;
  },

  generateCacheKey() {
    return String(Date.now()) + String(Math.floor(Math.random() * 10000));
  },

  // =================================================================
  //  AUTHENTICATION
  //
  //  *** ASK YOUR DEVELOPER TO PROVIDE ONE OF THESE: ***
  //
  //  Option 1: Bearer token / JWT
  //    → Set tempToken below
  //    → The script sends it via accessTokenFactory on the hub
  //
  //  Option 2: API Key header
  //    → Set apiKey and apiKeyHeader below
  //    → The script sends it as a custom header on negotiate + WS
  //
  //  Option 3: Cookie-based auth
  //    → Set authCookie below (full cookie string)
  //    → The script sends it as Cookie header
  //
  //  Without auth, SearchHotels returns ErrorOccured: []
  // =================================================================
  tempToken: '',           // e.g. 'eyJhbGciOiJIUzI1NiIs...'
  apiKey: '',              // e.g. 'sk-abc123...'
  apiKeyHeader: '',        // e.g. 'X-Api-Key' or 'Authorization'
  authCookie: '',          // e.g. 'session=abc123; token=xyz'

  // =================================================================
  //  SIGNALR HUB METHODS  (from documentation)
  // =================================================================
  signalr: {
    // Client invokes
    registerConnection: 'RegisterConnection',
    searchHotels: 'SearchHotels',
    nextPage: 'NextPage',
    filter: 'Filter',

    // Server pushes (typos are intentional — match server exactly)
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

var auth0Client = require('auth0').ManagementClient;
var jwks        = require('jwks-rsa');
var jwt         = require('express-jwt');

module.exports = {

  managementClient: new auth0Client({
    domain: 'farmradio.eu.auth0.com',
    clientId: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    scope: "read:users read:users_app_metadata",
  }),

  checkToken: jwt({
    secret: jwks.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: 'https://farmradio.eu.auth0.com/.well-known/jwks.json'
    }),
    audience: 'https://dev.farmradio.fm/api/',
    issuer: 'https://farmradio.eu.auth0.com/',
    algorithms: ['RS256']
  })

};

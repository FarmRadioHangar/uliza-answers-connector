require('dotenv').config();

var auth0Client = require('auth0').ManagementClient;
var bodyparser  = require('body-parser');
var cors        = require('cors');
var express     = require('express');
var jwks        = require('jwks-rsa');
var jwt         = require('express-jwt');
var db          = require('./db');
var worker      = require('./worker');

var SERVER_PORT = process.env.PORT || 8099;

var app = express();

app.use(cors());
app.use(bodyparser.urlencoded({ extended: true }));
app.use(bodyparser.json());
app.use(express.static('spa'));

var auth0 = new auth0Client({
  domain: 'farmradio.eu.auth0.com',
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  scope: "read:users read:users_app_metadata",
});

var router = express.Router();

app.use(router).use((error, req, res, next) => {
  res.json({ message: error.message });
});

db.init().then(conn => {

  var handlers = require('./handlers')(conn);

  router.get('/users/me', jwt({
    secret: jwks.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: 'https://farmradio.eu.auth0.com/.well-known/jwks.json'
    }),
    audience: 'https://dev.farmradio.fm/api/',
    issuer: 'https://farmradio.eu.auth0.com/',
    algorithms: ['RS256']
  }), (req, res, next) => {
    console.log('/users/me');
    auth0.getUser({ id: req.user.sub })
      .then(user => {
        var data = user.app_metadata || {};
        data.auth0_user_id = req.user.sub;
        res.json(data);
      });
  });

  router.post('/call_status/:campaign_id', (req, res, next) => {
    if (!req.body.delivery_status 
      || (!req.body.outgoing_call_id && !req.body.incoming_call_id)) {
      throw new Error('bad webhook request');
    }
    console.log('/call_status/' + req.params.campaign_id);
    handlers.callStatusUpdate(req, res);
  });

  app.listen(SERVER_PORT);
  console.log(`Uliza Answers connector listening on port ${SERVER_PORT}.`);

  worker.work();

})
.catch(error => { 
  console.error(error); 
});

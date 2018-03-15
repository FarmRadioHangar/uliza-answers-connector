require('dotenv').config();

var Auth0Strategy = require('passport-auth0');
var bodyParser    = require('body-parser');
var cookieParser  = require('cookie-parser');
var express       = require('express');
var http          = require('http');
var passport      = require('passport');
var path          = require('path');
var request       = require('request-promise');
var session       = require('express-session');

var ULIZA_ANSWERS_CONNECTOR_URL = process.env.ULIZA_ANSWERS_CONNECTOR_URL

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());

app.use(session({
  secret: 'VtaskhvaXhg3wC0btTb1778XibUSBDBT',
  resave: true,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

app.get('/', function(req, res) {
  res.render('index', {
    loggedIn: !!req.user
  });
});

function callback(addr) {
  return 'http://' + addr.address + ':' + addr.port + '/callback';
}

app.get('/login', function(req, res) {
  res.render('login', {
    env: {
      AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
      AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
      AUTH0_CALLBACK_URL: process.env.AUTH0_CALLBACK_URL || callback(server.address())
    }
  });
});

app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});

app.get('/error', function(req, res) {
  res.send('There was an error.');
});

app.get('/callback',
  passport.authenticate('auth0', {
    audience: 'https://dev.farmradio.fm/api/',
    failureRedirect: '/error'
  }), function(req, res) {
    res.redirect('/');
  }
);

app.get('/secret', function(req, res) {
  var options = {
    uri: ULIZA_ANSWERS_CONNECTOR_URL + '/users/me',
    json: true
  };
  if (req.user) {
    options.headers = { 'Authorization': 'Bearer ' + req.user.extraParams.access_token };
  }
  request.get(options)
    .then(function(json) {
      res.render('response', {
        response: JSON.stringify(json)
      });
    })
    .catch(function(err) {
      if ('RequestError' === err.name) {
        return res.send('Something went wrong. Is Uliza Connector accessible at ' + ULIZA_ANSWERS_CONNECTOR_URL + '?');
      } else if (err.response) {
        switch (err.response.statusCode) {
          case 401:
            return res.render('unauthorized');
          case 404:
            return res.render('response', {
              response: '404 Not found.'
            });
        }
      }
      res.send('Something went wrong.');
      throw err;
    });
});

var server = http.createServer(app);

server.on('error', function(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }
  var bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
});

server.on('listening', function() {
  var addr = server.address();
  var strategy = new Auth0Strategy({
    domain: process.env.AUTH0_DOMAIN,
    clientID: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    callbackURL: process.env.AUTH0_CALLBACK_URL || callback(addr)
  }, function(accessToken, refreshToken, extraParams, profile, done) {
    return done(null, {
      profile: profile,
      accessToken: accessToken,
      refreshToken: refreshToken,
      extraParams: extraParams
    });
  });
  passport.use(strategy);
  var bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
  console.log('Demo server listening on ' + bind);
});

server.listen(3001, '127.0.0.1');

require('dotenv').config();

var bodyparser  = require('body-parser');
var chalk       = require('chalk');
var express     = require('express');
var requestJson = require('request-json');

var app = express();

app.use(bodyparser.urlencoded({extended: true}));
app.use(bodyparser.json());

var SERVER_PORT
  = process.env.PORT           || 8099;
var ZAMMAD_API_URL
  = process.env.ZAMMAD_API_URL || 'https://answers.uliza.fm/api/v1/';
var ZAMMAD_API_TOKEN
  = process.env.ZAMMAD_API_TOKEN;
var VIAMO_API_URL
  = process.env.VIAMO_API_URL  || 'https://go.votomobile.org/api/v1/';
var VIAMO_API_KEY
  = process.env.VIAMO_API_KEY;

var router = express.Router();

var zammad = requestJson.createClient(ZAMMAD_API_URL);
var viamo  = requestJson.createClient(VIAMO_API_URL);

zammad.headers['Authorization'] = 'Token token=' + ZAMMAD_API_TOKEN;
viamo.headers['api_key']        = VIAMO_API_KEY;

/* Server error exceptions */

function errorMsg(code, error, message) {
  var resp = {
    status: code
  };
  if (error) {
    resp.error = error;
  }
  if (message) {
    resp.message = message;
  }
  return resp;
}

function badRequest(message, error) {
  return errorMsg(400, error || 'badRequest', message);
}

function notFound(message, error) {
  return errorMsg(404, error || 'notFound', message);
}

function badGateway(message, error) {
  return errorMsg(502, error || 'badGateway', message);
}

function internalServerError(message, error) {
  return errorMsg(500, error || 'internalServerError', message);
}

/* Generic API client */

function buildRequest(yield) {
  return new Promise(function(resolve, reject) {
    var callback = function(error, response, body) {
      if (error) {
        return reject(error);
      }
      if (isOk(response.statusCode)) {
        console.log(
          chalk.yellow('[response_code] ')
          + chalk.green('\u2714 ')
          + chalk.white(response.statusCode)
        );
      } else {
        /* Log body if we get something else than a 2xx response. */
        console.log(
          chalk.redBright('[response_code] ')
          + chalk.white(response.statusCode)
        );
        console.log(
          chalk.redBright('[response_body] ')
          + JSON.stringify(response.body)
        );
      }
      resolve({
        all: response,
        body: body
      });
    };
    yield(callback);
  });
}

function makeRequest(client, uri, respCodes, method, data) {
  console.log(
    chalk.magentaBright.bold(method + ' ' + client.host + uri)
  );
  return buildRequest(function(callback) {
    if ('object' === typeof(data)) {
      /* Log request body for debugging purposes */
      console.log(
        chalk.magentaBright('[request_body] ') + JSON.stringify(data)
      );
      client[method.toLowerCase()](uri, data, callback);
    } else {
      client[method.toLowerCase()](uri, callback);
    }
  })
  .then(function(response) {
    validate(response, respCodes || []);
    return response;
  });
}

function isOk(code) {
  return '2' === (code + '')[0];
}

function validate(response, allowed) {
  var code = response.all.statusCode;
  if (!isOk(code) && -1 == allowed.indexOf(code)) {
    console.error(chalk.redBright(
      response.body.message || response.body
    ));
    throw badGateway(
      'serverNon200Response',
      'Server returned a ' + code + ' status code.'
    );
  }
}

function viamoGet(uri, respCodes) {
  return makeRequest(viamo, uri, respCodes, 'GET');
}

function viamoPost(uri, data, respCodes) {
  return makeRequest(viamo, uri, respCodes, 'POST', data);
}

function viamoPut(uri, data, respCodes) {
  return makeRequest(viamo, uri, respCodes, 'PUT', data);
}

function viamoPatch(uri, data, respCodes) {
  return makeRequest(viamo, uri, respCodes, 'PATCH', data);
}

function zammadGet(uri, respCodes) {
  return makeRequest(zammad, uri, respCodes, 'GET');
}

function zammadPost(uri, data, respCodes) {
  return makeRequest(zammad, uri, respCodes, 'POST', data);
}

function zammadPut(uri, data, respCodes) {
  return makeRequest(zammad, uri, respCodes, 'PUT', data);
}

function zammadPatch(uri, data, respCodes) {
  return makeRequest(zammad, uri, respCodes, 'PATCH', data);
}

function assertBodyField(request, field) {
  if (!request.body[field]) {
    var msg = 'Missing field ' + field + ' in webhook request body.';
    console.error(chalk.redBright('[bad_webhook] ') + msg);
    throw badRequest(msg, 'badWebhook');
  }
}

function viamoDeliveryStatus(code) {
  switch (code) {
    case 1: return  ['Queued', ''];
    case 2: return  ['Ringing', ''];
    case 3: return  ['In Progress', ''];
    case 4: return  ['Waiting to retry', 
      'Call not connected on previous attempt, will retry'];
    case 5: return  ['Failed (No Answer)', 
      'Call was not answered'];
    case 6: return  ['Finished (Complete)', 
      'Call was answered, and subscriber hung up after completing the content'];
    case 7: return  ['Finished (Incomplete)', 
      'Call was answered, but subscriber hung up without completing the content'];
    case 8: return  ['Failed (No Viamo Credit)', 
      'Insufficient credit to complete call'];
    case 9: return  ['Failed (Network)', 
      'Call failed due to network conditions beyond Viamo'];
    case 10: return ['Failed (Cancelled)', 
      'Account user cancelled the call'];
    case 11: return ['Sent', 
      'Only relevant for SMS: sent to gateway, with no delivery report yet'];
    case 12: return ['Finished (Voicemail)', 
      'Reached voicemail; Played the prompt message into voicemail'];
    case 13: return ['Failed (Voicemail)', 
      'Call hung up on reaching voicemail'];
    case 14: return ['Failed (Error)', '']; 
    default: return ['Invalid Status Code', ''];
  }
}

router.post('/update', function(req, res) {
  return Promise.resolve()
  .then(function() {
    assertBodyField(req, 'delivery_status');
    var deliveryStatus = Number(req.body.delivery_status);
    console.log(
      chalk.cyan('[viamo_call_status_update] ') + JSON.stringify(req.body)
    );
    var humanReadable = viamoDeliveryStatus(deliveryStatus);
    console.log(
      chalk.cyan('[delivery_status] ') 
      + deliveryStatus + ': ' 
      + humanReadable[0]
    );
    if (humanReadable[1]) {
      console.log(
        chalk.bold(humanReadable[1])
      );
    }
    switch (deliveryStatus) {
      case 1:  /* Queued */
        break;
      case 2:  /* Ringing */
        break;
      case 3:  /* In Progress */
        break;
      case 4:  /* Waiting to retry */
        break;
      case 5:  /* Failed (No Answer) */
        break;
      case 6:  /* Finished (Complete) */
        break;
      case 7:  /* Finished (Incomplete) */
        break;
      case 8:  /* Failed (No Viamo Credit) */
        break;
      case 9:  /* Failed (Network) */
        break;
      case 10: /* Failed (Cancelled) */
        break;
      case 11: /* Sent (SMS) */
        break;
      case 12: /* Finished (Voicemail) */
        break;
      case 13: /* Failed (Voicemail) */
        break;
      case 14: /* Failed (Error) */
        break;
      default: /* Invalid status code */
        break;
    }
    res.json({msg: 'OK'});
  })
  .catch(function(error) {
    var response = { error: error.error };
    if (error.message) {
      response.message = error.message;
    }
    res.status(error.status || 500);
    res.json(response);
    console.error(chalk.redBright(JSON.stringify(response)));
  });
});

viamoGet('languages') /* Basic connectivity test of arbitrary endpoint. */
.catch(function(error) {
  console.error('Failed connecting to Viamo API on ' + VIAMO_API_URL + '.');
  process.exit(1);
})
.then(function() {
  console.log('Viamo API connection OK.');
  return zammadGet('users/me');
})
.catch(function(error) {
  console.error('Failed connecting to Zammad API on ' + ZAMMAD_API_URL + '.');
  process.exit(1);
})
.then(function() {
  console.log('Zammad API connection OK.');
  /* Now we can run the server. */
  app.use(router);
  app.listen(SERVER_PORT);
  console.log(
    chalk.bold.yellow('Uliza Answers connector listening on port ' + SERVER_PORT)
  );
});

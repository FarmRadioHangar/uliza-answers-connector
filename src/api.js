var chalk = require('chalk');

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

module.exports = {

  badRequest: function(message, error) {
    return errorMsg(400, error || 'badRequest', message);
  },

  notFound: function(message, error) {
    return errorMsg(404, error || 'notFound', message);
  },

  badGateway: function(message, error) {
    return errorMsg(502, error || 'badGateway', message);
  },

  internalServerError: function(message, error) {
    return errorMsg(500, error || 'internalServerError', message);
  },

  makeRequest: function(client, uri, respCodes, method, data) {
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
  },

  assertBodyField: function(request, field) {
    if (!request.body[field]) {
      var msg = 'Missing field ' + field + ' in webhook request body.';
      console.error(chalk.redBright('[bad_webhook] ') + msg);
      throw badRequest(msg, 'badWebhook');
    }
  }

};

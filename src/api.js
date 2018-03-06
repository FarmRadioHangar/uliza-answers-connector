var chalk = require('chalk');

function buildRequest(yield) {
  return new Promise(function(resolve, reject) {
    var callback = function(error, response, body) {
      if (error) {
        throw new Error(error);
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
          chalk.redBright('[response_body] ') + JSON.stringify(body)
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
    throw new Error('Server returned a non-200 response code.');
  }
}

module.exports = {

  makeRequest: function(client, uri, respCodes, method, data) {
    console.log(
      chalk.magentaBright.bold(method + ' ' + client.host + uri)
    );
    return buildRequest(function(callback) {
      if ('object' === typeof(data)) {
        // /* Log request body for debugging purposes */
        // console.log(
        //   chalk.magentaBright('[request_body] ') + JSON.stringify(data)
        // );
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
      throw new Error('Invalid webhook request object.');
    }
  }

};

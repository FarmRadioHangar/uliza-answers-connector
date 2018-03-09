require('dotenv').config();

var base64     = require('base64-stream');
var bodyparser = require('body-parser');
var chalk      = require('chalk');
var express    = require('express');
var https      = require('https');
var lame       = require('lame');
var ora        = require('ora');
var sequential = require('promise-sequential');
var spinners   = require('cli-spinners');
var api        = require('./api');
var db         = require('./db');
var viamo      = require('./viamo');
var zammad     = require('./zammad');

var app = express();

app.use(bodyparser.urlencoded({extended: true}));
app.use(bodyparser.json());

var SERVER_PORT = process.env.PORT || 8099;
var ZAMMAD_POLLING_INTERVAL = process.env.ZAMMAD_POLLING_INTERVAL || 6000;

var router = express.Router();

function getBlock(interactions, id) {
  for (var i = 0; i < interactions.length; ++i) {
    if (interactions[i].block_id == id) {
      return interactions[i];
    }
  }
  return null;
}

function encodeAudio(url) {
  return new Promise(function(resolve, reject) {
    var encoder = new lame.Encoder({
      channels: 1,
      bitDepth: 16,
      sampleRate: 8000,
      bitRate: 128,
      outSampleRate: 22050
    });
    https.get(url, function(response) {
      var output = new base64.Encode();
      response.pipe(encoder);
      encoder.pipe(output);
      var buffer = '';
      output.on('data', function(chunk) {
        buffer += chunk.toString();
      });
      output.on('end', function() {
        resolve(buffer);
      });
      output.on('error', function(error) {
        reject(error);
      });
    });
  });
}

function processCall(id, audioBlockId) {
  var deliveryLogEntry, messageBlock;
  var spinner = ora('Encoding audio');
  spinner.spinner = spinners.arrow3;
  return viamo.get('outgoing_calls/' + id + '/delivery_logs', {
    accept: [404]
  })
  .then(function(response) {
    if (404 == response.all.statusCode) {
      console.error(chalk.redBright('[bad_webhook_request] ')
        + 'Outgoing call not found.'
      );
      throw new Error('Invalid Viamo call ID.');
    }
    return response.body.data.delivery_logs;
  })
  .then(function(logs) {
    if (!logs || 0 == logs.length) {
      throw new Error('Empty delivery log.');
    }
    deliveryLogEntry = logs[0];
    console.log(
      chalk.cyan('[tree_id] ') + deliveryLogEntry.tree_id
    );
    return viamo.get(
      'trees/' + deliveryLogEntry.tree_id +
      '/delivery_logs/' + deliveryLogEntry.id
    );
  })
  .then(function(response) {
    return response.body.data;
  })
  .then(function(data) { // = { interactions, delivery_log, tree }
    messageBlock = getBlock(data.interactions, audioBlockId);
    var valid = messageBlock
      && messageBlock.response
      && messageBlock.response.open_audio_url;
    if (!valid) {
      throw new Error(
        'Couldn\'t find any audio response block matching ID ' + audioBlockId
      );
    }
    console.log(
      chalk.cyan('[response_audio_url] ') + messageBlock.response.open_audio_url
    );
    spinner.start();
    return encodeAudio(messageBlock.response.open_audio_url);
  })
  .then(function(data) {
    spinner.succeed();
    var payload = {
      title: '[viamoOpenEndedAudio]',
      group: 'Bart FM',
      customer_id: 'guess:' + deliveryLogEntry.subscriber.phone + '@uliza.fm',
      article: {
        subject: 'n/a',
        body: 'n/a',
        attachments: [{
          filename: messageBlock.response.open_audio_file + '.mp3',
          data: '###', // Added later to prevent proliferation of log output
          'mime-type': 'audio/mp3'
        }]
      }
    };
    console.log(
      chalk.cyan('[zammad_post_ticket] ') + JSON.stringify(payload)
    );
    payload.article.attachments[0].data = data;
    return zammad.post('tickets', payload, {logRequestBody: false});
  })
  .then(function(response) {
    db.createTicket(
      response.body.id,
      deliveryLogEntry.subscriber.phone,
      messageBlock.response.open_audio_file
    );
    console.log(
      chalk.yellow('[ticket_created] ') + 'Ticket created successfully'
    );
    console.log(JSON.stringify(response.body));
    console.log(
      chalk.cyan('[zammad_ticket_id] ') + response.body.id
    );
    console.log(
      chalk.bold('https://answers.uliza.fm/#ticket/zoom/' + response.body.id)
    );
  })
  .catch(function(error) {
    spinner.stop();
    throw error;
  });
}

function assertQueryParam(request, param) {
  if (!request.query[param]) {
    var msg = 'Query parameter ' + param + ' missing.';
    console.error(chalk.redBright('[bad_webhook] ') + msg);
    throw new Error('Webhook request parameters must include ' + param + '.');
  }
}

function assertBodyField(request, field) {
  if (!request.body[field]) {
    var msg = 'Missing field ' + field + ' in webhook request body.';
    console.error(chalk.redBright('[bad_webhook] ') + msg);
    throw new Error('Invalid webhook request object.');
  }
}

router.post('/update', function(req, res) {
  res.json(); /* The HTTP response here doesn't really matter. */
  return Promise.resolve()
  .then(function() {
    assertBodyField(req, 'delivery_status');
    assertBodyField(req, 'outgoing_call_id');
    assertQueryParam(req, 'audio_block_id');
    var deliveryStatus = Number(req.body.delivery_status),
        outgoingCallId = req.body.outgoing_call_id,
        statusMessage  = viamo.deliveryStatus(deliveryStatus);
    console.log(
      chalk.cyan('[viamo_call_status_update] ') + JSON.stringify(req.body)
    );
    console.log(
      chalk.cyan('[delivery_status] ')
      + deliveryStatus + ': '
      + statusMessage[0]
    );
    if (statusMessage[1]) {
      console.log(
        chalk.bold(statusMessage[1])
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
      case 7:  /* Finished (Incomplete) */
        return processCall(outgoingCallId, req.query.audio_block_id);
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
  })
  .catch(function(error) {
    console.error(chalk.redBright(error));
  });
});

var spinner = ora('Connecting to Viamo and Zammad services.')
spinner.start();

function registerRecentArticles(ticket) {
  return zammad.get('ticket_articles/by_ticket/' + ticket.zammad_id, {
    silent: true
  })
  .then(function(response) {
    var articles = response.body;
    var diff = articles.length - ticket.articles;
    if (diff > 0) {
      /* One or more articles have been added. */
      db.updateArticlesCount(ticket.id, articles.length);
      var recent = articles.slice(-diff);
      console.log(
        chalk.yellow('[zammad_ticket_update_id] ') + ticket.zammad_id
      );
      console.log(
        chalk.cyan('[zammad_ticket_article(s)_added] ')
        + JSON.stringify(recent)
      );
    }
  });
}

function setPollTimeout() {
  setTimeout(function() {
    pollZammad()
    .catch(function(error) {
      console.error(error);
    });
  }, ZAMMAD_POLLING_INTERVAL);
}

function pollZammad() {
  return db.getTickets()
  .then(function(results) {
    return sequential(
      results.map(function(ticket) {
        return function() {
          return registerRecentArticles(ticket);
        }
      })
    );
  })
  .then(function() {
    setPollTimeout();
  });
}

viamo.get('languages', {silent: true}) /* Viamo connectivity test */
.catch(function(error) {
  spinner.fail();
  console.error('Failed connecting to Viamo API.');
  process.exit(1);
})
.then(function() { /* Viamo API connection OK. */
  return zammad.get('users/me', {silent: true});
})
.catch(function(error) {
  spinner.fail();
  console.error('Failed connecting to Zammad API.');
  process.exit(1);
})
.then(function() { /* Zammad API connection OK. */
  spinner.succeed();
  return db.init();
})
.then(function() {
  app.use(router); /* Now we can run the server. */
  app.listen(SERVER_PORT);
  console.log(chalk.bold.yellow(
    'Uliza Answers connector listening on port ' + SERVER_PORT
  ));
  setPollTimeout();
})
.catch(function(error) {
  spinner.fail();
  console.error(error);
  process.exit(1);
});

require('dotenv').config();
var bodyparser = require('body-parser'); var chalk      = require('chalk');
var express    = require('express');
var api        = require('./api');
var viamo      = require('./viamo');
var zammad     = require('./zammad');

var app = express();

app.use(bodyparser.urlencoded({extended: true}));
app.use(bodyparser.json());

var SERVER_PORT = process.env.PORT || 8099;

var router = express.Router();

function processCall(id) {
  return viamo.get('outgoing_calls/' + id + '/delivery_logs', [404])
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
    var log = logs[0];
    console.log(
      chalk.cyan('[tree_id] ') + log.tree_id
    );
    var url = 'trees/' + log.tree_id + '/delivery_logs/' + log.id;
    return viamo.get(url);
  })
  .then(function(response) {
    return response.body.data;
  })
  .then(function(data) {
    var interactions = data.interactions
        deliveryLog = data.delivery_log,
        tree = data.tree;

        // 9761370

    // Get audio and send it to Zammad?

    //console.log(interactions);
  });
}

router.post('/update', function(req, res) {
  res.json(); /* The response here doesn't really matter. */
  return Promise.resolve()
  .then(function() {
    api.assertBodyField(req, 'delivery_status');
    api.assertBodyField(req, 'outgoing_call_id');
    var deliveryStatus = Number(req.body.delivery_status),
        outgoingCallId = req.body.outgoing_call_id,
        humanReadable  = viamo.deliveryStatus(deliveryStatus);
    console.log(
      chalk.cyan('[viamo_call_status_update] ') + JSON.stringify(req.body)
    );
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
      case 7:  /* Finished (Incomplete) */
        return processCall(outgoingCallId)
        .then(function() {
          //
        });
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
  })
  .catch(function(error) {
    console.error(chalk.redBright(error));
  });
});

viamo.get('languages') /* Basic connectivity test of arbitrary endpoint. */
.catch(function(error) {
  console.error('Failed connecting to Viamo API on ' + VIAMO_API_URL + '.');
  process.exit(1);
})
.then(function() {
  console.log('Viamo API connection OK.');
  return zammad.get('users/me');
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

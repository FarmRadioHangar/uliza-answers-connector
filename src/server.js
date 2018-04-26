require('dotenv').config();

var auth0Client = require('auth0').ManagementClient;
var base64      = require('base64-stream');
var bodyparser  = require('body-parser');
var chalk       = require('chalk');
var cors        = require('cors');
var express     = require('express');
var ffmpeg      = require('fluent-ffmpeg');
var fs          = require('fs');
var jwks        = require('jwks-rsa');
var jwt         = require('express-jwt');
var ora         = require('ora');
var request     = require('request');
var sequential  = require('promise-sequential');
var spinners    = require('cli-spinners');
var tmp         = require('tmp');
var api         = require('./api');
var db          = require('./db');
var viamo       = require('./viamo');
var zammad      = require('./zammad');

var app = express();

app.use(cors());
app.use(bodyparser.urlencoded({extended: true}));
app.use(bodyparser.json());
app.use(express.static('demo-spa'));

var auth0 = new auth0Client({
  domain: 'farmradio.eu.auth0.com',
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  scope: "read:users read:users_app_metadata",
});

var SERVER_PORT = process.env.PORT || 8099;
var ZAMMAD_POLLING_INTERVAL = process.env.ZAMMAD_POLLING_INTERVAL || 6000;
var ZAMMAD_API_TOKEN = process.env.ZAMMAD_API_TOKEN;
var ZAMMAD_API_URL = process.env.ZAMMAD_API_URL ||
  'https://answers.uliza.fm/api/v1/';
var VIAMO_API_KEY = process.env.VIAMO_API_KEY;
var VIAMO_API_URL = process.env.VIAMO_API_URL ||
  'https://go.votomobile.org/api/v1/';

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
    var output = new base64.Encode();
    ffmpeg().input(request.get({
      url: url,
      encoding: null,
    }))
    .outputFormat('mp3')
    .pipe(output);
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
}

function createTicket(payload, phone, audioUrl, audioMimeData) {
  console.log(
    chalk.cyan('[zammad_post_ticket] ') + JSON.stringify(payload)
  );
  payload.article.attachments[0].data = audioMimeData;
  return zammad.post('tickets', payload, {
    logRequestBody: false
  })
  .then(function(response) {
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
    db.createTicket(response.body.id, phone, audioUrl);
    return response;
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
    console.log(data.interactions);
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
          data: '###', // Added later to prevent log proliferation
          'mime-type': 'audio/mp3'
        }]
      }
    };
    return createTicket(
      payload, 
      deliveryLogEntry.subscriber.phone, 
      messageBlock.response.open_audio_url, 
      data
    );
  })
  .then(function() {
    return viamo.post('outgoing_calls', {
      message_id: 2595089,
      send_to_phones: deliveryLogEntry.subscriber.phone
    });
    console.log(
      chalk.cyan('[sms_sent] ') + JSON.stringify(deliveryLogEntry.subscriber.phone)
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

var checkToken = jwt({
  secret: jwks.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: 'https://farmradio.eu.auth0.com/.well-known/jwks.json'
  }),
  audience: 'https://dev.farmradio.fm/api/',
  issuer: 'https://farmradio.eu.auth0.com/',
  algorithms: ['RS256']
});

router.post('/tickets', function(req, res) {
  var spinner = ora('Encoding audio');
  spinner.spinner = spinners.arrow3;
  return Promise.resolve()
  .then(function() {
    assertBodyField(req, 'subscriber_phone');
    assertBodyField(req, 'audio_url');
    spinner.start();
    return encodeAudio(req.body.audio_url);
  })
  .then(function(data) {
    spinner.succeed();
    var phone = req.body.subscriber_phone;
    var payload = {
      title: req.body.title || '[ulizaQuestion]',
      group: req.body.group || 'Bart FM',
      customer_id: 'guess:' + phone + '@uliza.fm',
      article: {
        subject: req.body.subject || 'n/a',
        body: req.body.body || 'n/a',
        attachments: [{
          filename: 'uliza_audio.mp3',
          data: '###',
          'mime-type': 'audio/mp3'
        }]
      }
    };
    return createTicket(payload, phone, req.body.audio_url, data);
  })
  .then(function(zammadResponse) {
    var ticket = zammadResponse.body;
    res.json({
      id: ticket.id,
      url: 'https://answers.uliza.fm/#ticket/zoom/' + ticket.id
    });
  })
  .catch(function(error) {
    spinner.stop();
    console.error(chalk.redBright(error));
    res.sendStatus(500);
  });
});

router.get('/users/me', checkToken, function(req, res) {
  var userId = req.user.sub.replace(/^auth0\|/, '');
  auth0.getUser({id: req.user.sub})
  .then(function(user) {
    if (user.app_metadata && Object.keys(user.app_metadata).length) {
      var data = user.app_metadata; 
      data.auth0_user_id = userId;
      console.log(
        chalk.cyan('[auth0_app_metadata] ') + JSON.stringify(data)
      );
      res.json(data);
    } else {
      console.log(chalk.cyan('[no_auth0_metadata] '));
      db.getUser(userId)
      .then(function(results) {
        if (results) {
          res.json({
            auth0_user_id: userId,
            zammad_token: results.zammad_token,
            firebase_login: results.firebase_login,
            sip_username: results.sip_username,
            sip_password: results.sip_password,
            sip_host: results.sip_host
          });
        } else {
          res.status(404).send('Not found');
        }
      });
    }
  });
});

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

function isAudio(file) {
  if (!file) return false;
  return /^.+\.(wav|mp3|mp4|ogg|ul|webm)$/.test(file);
}

function firstAudioAttachment(article) {
  if (article.attachments) {
    for (i = 0; i < article.attachments.length; i++) {
      var attachment = article.attachments[i];
      if (isAudio(attachment.filename)) {
        return attachment;
      }
    }
  }
  return null;
}

function fileExtension(file) {
  var pieces = file.split('.');
  return pieces[pieces.length - 1];
}

function postViamoAudio(options, description) {
  return new Promise(function(resolve, reject) {
    var tmpfile = tmp.fileSync();
    ffmpeg().input(request.get(options))
    .outputFormat('wav')
    .output(fs.createWriteStream(tmpfile.name))
    .on('end', function() {
      fs.createReadStream(tmpfile.name)
      .pipe(request.post({
        url: VIAMO_API_URL + 'audio_files',
        qs: {
          'description': description,
          'file_extension': 'wav',
          'language_id': 206069,
          'api_key': VIAMO_API_KEY
        },
        json: true
      }, function(error, response, body) {
        if (200 == response.statusCode) {
          resolve(body.data);
        } else {
          reject(
            'Viamo audio upload failed with response code ' 
            + response.statusCode 
            + '.'
          );
        }
      }));
    }).run();
  });
}

var TICKET_CLOSED_STATE_ID = 4;

function monitorTicket(ticket) {
  return zammad.get('tickets/' + ticket.zammad_id + '/?all=true', {
    silent: true
  })
  .then(function(response) {
    var assets       = response.body.assets,
        zammadTicket = assets.Ticket[ticket.zammad_id],
        articles     = assets.TicketArticle;
    /* Ticket state has changed. Was it closed? */
    if (ticket.state_id != zammadTicket.state_id) {
      db.updateTicketState(ticket.id, zammadTicket.state_id);
      if (TICKET_CLOSED_STATE_ID === zammadTicket.state_id) {
        console.log(
          chalk.yellow('[zammad_ticket_closed] ') + ticket.zammad_id
        );
        var audioFiles = Object.keys(articles).map(function(key) {
          var article = articles[key];
          return {
            article: article,
            attachment: firstAudioAttachment(article)
          };
        }).filter(function(item) {
          return !!item.attachment;
        });
        if (audioFiles.length > 1) {
          var questionAudioId, answerAudioId, surveyId;
          var item = audioFiles[audioFiles.length - 1];
          var zammadUrl = ZAMMAD_API_URL
            + 'ticket_attachment/' + ticket.zammad_id
            + '/' + item.article.id + '/' + item.attachment.id;
          return postViamoAudio({
            url: zammadUrl,
            encoding: null,
            headers: {
              Authorization: 'Token token=' + ZAMMAD_API_TOKEN
            } 
          }, item.attachment.filename)
          .then(function(id) {
            console.log(
              chalk.yellow('[viamo_answer_audio_created] ') + id
            );
            answerAudioId = id;
            console.log(ticket.audio);
            return postViamoAudio({
              url: ticket.audio,
              encoding: null
            }, 'question');
          })
          .then(function(id) {
            console.log(
              chalk.yellow('[viamo_question_audio_created] ') + id
            );
            questionAudioId = id;
            /* Create Viamo survey */
            viamo.post('surveys', {
              survey_title: 'Uliza Answers Response'
            })
            .then(function(response) {
              surveyId = response.body.data;
              console.log(
                chalk.yellow('[viamo_survey_created] ') + surveyId
              );
              /* Question */
              return viamo.post('surveys/' + surveyId + '/questions' 
                  + '?audio_file[206069]=' + questionAudioId
                  + '&options[]=', {
                response_type: 4,
                question_title: 'Uliza Answers Question'
              });
            })
            .then(function() {
              return Promise.all([
                /* Answer */
                viamo.post('surveys/' + surveyId + '/questions'
                    + '?audio_file[206069]=' + answerAudioId
                    + '&options[]=', {
                  response_type: 4,
                  question_title: 'Uliza Answers Response'
                }),
                /* Create an intro */
                viamo.post(
                  'surveys/' + surveyId + '/introduction?audio_file[206069]=344943', {}
                ),
                /* Add conclusion */
                viamo.post(
                  'surveys/' + surveyId + '/conclusion?audio_file[206069]=344947', {}
                )
              ]);
            })
            .then(function(response) {
              /* Satisfied ? */
              return viamo.post('surveys/' + surveyId + '/questions'
                  + '?audio_file[206069]=344977'
                  + '&options[0]=Yes&options[1]=No&options[2]=Repeat&condition[0]=1,conclude&condition[1]=2,conclude&condition[2]=3,' + response[0].body.data, {
                response_type: 1,
                question_title: 'Uliza Answers Response'
              });
            })
            .then(function() {
              return viamo.post('outgoing_calls', {
                survey_id: surveyId,
                send_to_phones: ticket.subscriber_phone
              });
            })
            .then(function() {
              console.log(
                chalk.yellow('[outgoing_call_scheduled]')
              );
            });
          });
        }
      }
    }
  })
  .then(function() {
    return zammad.get('ticket_articles/by_ticket/' + ticket.zammad_id, {
      silent: true
    });
  })
  .then(function(response) {
    var articles = response.body;
    var diff = articles.length - ticket.articles_count;
    if (diff > 0) {
      /* One or more articles have been added. */
      db.updateArticlesCount(ticket.id, articles.length);
      var recent = articles.slice(-diff);
      console.log(
        chalk.yellow('[zammad_ticket_articles_count_changed] ') + ticket.zammad_id
      );
      console.log(
        chalk.cyan('[zammad_ticket_article(s)_added] ') + JSON.stringify(recent)
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
          return monitorTicket(ticket);
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

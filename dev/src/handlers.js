var base64  = require('base64-stream');
var request = require('request');
var rp      = require('request-promise');
var ffmpeg  = require('fluent-ffmpeg');
var ffmpegProc = require('ffmpeg');
var tmp     = require('tmp');
var fs      = require('fs');

var VIAMO_API_URL  = process.env.VIAMO_API_URL  || 'https://go.votomobile.org/api/v1/';
var ZAMMAD_API_URL = process.env.ZAMMAD_API_URL || 'https://answers.uliza.fm/api/v1/';

var db;

function encodeAudio(url) {
  return new Promise(function(resolve, reject) {
    var tmpfile = tmp.fileSync();
    var outfile = tmp.fileSync();
    console.log(url);
    console.log(outfile.name);
    request.get({ url: url, encoding: null })
      .pipe(fs.createWriteStream(tmpfile.name))
      .on('error', (error) => {
        reject(error);
      })
      .on('close', () => {
        try {
          new ffmpegProc(tmpfile.name, (err, out) => {
            if (!err) {
              out.fnExtractSoundToMP3(outfile.name, (error, file) => {
                if (!error) {
                  var output = new base64.Encode();
                  var buffer = '';
                  fs.createReadStream(file).pipe(output);
                  output.on('data', function(chunk) {
                    buffer += chunk.toString();
                  });
                  output.on('end', function() {
                    resolve(buffer);
                  });
                  output.on('error', function(error) {
                    reject(error);
                  });
                } else {
                  reject(error);
                }
              });
            }
          });
        } catch (error) {
          reject(error);
        }
      });

    //ffmpeg().input(request.get({
    //  url: url,
    //  encoding: null,
    //}))
    //.audioBitrate('128k')
    //.outputFormat('mp3')
    //.on('end', () => {
    //  console.log('DONE');
    //  resolve(null);
    //})
    ////.pipe(output);
    //.pipe(fs.createWriteStream(tmpfile.name));

    //var buffer = '';
    //output.on('data', function(chunk) {
    //  buffer += chunk.toString();
    //});
    //output.on('end', function() {
    //  resolve(buffer);
    //});
    //output.on('error', function(error) {
    //  reject(error);
    //});

  });
}

function createTicket(ticket) {
  var logEntry, messageBlock;
  return db.all('SELECT * FROM campaigns WHERE id = ?;', ticket.campaign.id)
    .then(results => {
      if (!results.length) {
        throw new Error('invalid campaign ID');
      }
      ticket.campaign = results[0];
      var uri = ticket.call.type + '_calls/' + ticket.call.id + '/delivery_logs';
      console.log(uri);
      return rp({
        uri: VIAMO_API_URL + uri,
        headers: { api_key: ticket.campaign.viamo_api_key },
        json: true
      });
    })
    .then(response => {
      var logs = response.data.delivery_logs;
      if (!logs || 0 == logs.length) {
        throw new Error('no call delivery logs found');
      }
      logEntry = logs[logs.length - 1];
      if (ticket.call.delivery_log_id) {
        for (var i = 0; i < logs.length; i++) {
          if (logs[i].id == ticket.call.delivery_log_id) {
            logEntry = logs[i];
            break;
          }
        }
      }
      //if (logEntry.tree_id != ticket.campaign.viamo_tree_id) {
      //  throw new Error('call tree ID doesn\'t match campaign tree');
      //}
      var uri = 'trees/' + logEntry.tree_id + '/delivery_logs/' + logEntry.id;
      if (ticket.call.delivery_log_id) {
        uri = 'trees/' + ticket.campaign.viamo_tree_id + '/delivery_logs/' + ticket.call.delivery_log_id;
      }
      console.log(uri);
      return rp({
        uri: VIAMO_API_URL + uri,
        headers: { api_key: ticket.campaign.viamo_api_key },
        json: true
      });
    })
    .then(response => {
      var interactions = response.data.interactions;
      console.log('Looking for Tree block ID :' + ticket.campaign.viamo_tree_block_id);
      for (var i = 0; i < interactions.length; i++) {
        if (interactions[i].block_id == ticket.campaign.viamo_tree_block_id) {
          messageBlock = interactions[i];
          break;
        }
      }
      if (!messageBlock) {
        throw new Error('question block not found');
      }
      return encodeAudio(messageBlock.response.open_audio_url);
    })
    .then(data => {
      var subject = messageBlock.response.open_audio_file;
      var payload = {
        title: ticket.campaign.name,
        group: ticket.campaign.zammad_group,
        customer_id: 'guess:' + ticket.call.subscriber_phone + '@uliza.fm',
        article: {
          subject: subject,
          body: subject,
          attachments: [{
            filename: messageBlock.response.open_audio_file + '.mp3',
            data: '###', // Added later to prevent log proliferation
            'mime-type': 'audio/mp3'
          }]
        }
      };
      payload.article.attachments[0].data = data;
      return rp({
        uri: ZAMMAD_API_URL + 'tickets',
        method: 'POST',
        body: payload,
        headers: {
          Authorization: 'Token token=' + process.env.ZAMMAD_API_TOKEN
        },
        json: true
      });
    })
    .then(response => {
      console.log('https://answers.uliza.fm/#ticket/zoom/' + response.id);
      var query = 'INSERT INTO tickets (subscriber_phone, audio_url, campaign_id, zammad_id, article_count, state_id, first_article_id, monitor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, DATETIME(\'now\'));';
      return db.run(query,
        ticket.call.subscriber_phone,
        messageBlock.response.open_audio_url,
        ticket.campaign.id,
        response.id,
        response.article_count,
        response.state_id,
        response.article_ids[0]
      );
    })
    .then(res => {
//      // Lookup existing subscriber
//      return rp({
//        uri: VIAMO_API_URL + uri,
//        headers: { api_key: ticket.campaign.viamo_api_key },
//        json: true
//      })
//      .then(response => {
//      });
//
//      // Create new subscriber
//
//      // Send SMS?

      console.log(res.lastID);
    })
    .catch(error => {
      console.error(error);
    });
}

module.exports = function(conn) {
  db = conn; return {

    callStatusUpdate: function(req, res) {
      var call = {};
      if (req.body.outgoing_call_id) {
        call.type = 'outgoing';
        call.id = req.body.outgoing_call_id;
      } else {
        call.type = 'incoming';
        call.id = req.body.incoming_call_id;
      }
      call.delivery_log_id = req.body.delivery_log_id;
      call.subscriber_phone = req.body.subscriber_phone;
      console.log(call);
      console.log(req.body.delivery_status);
      switch (Number(req.body.delivery_status)) {
        case 6: /* Finished (Complete) */
        case 7: /* Finished (Incomplete) */
          createTicket({
            call: call,
            campaign: { id: req.params.campaign_id }
          });
          break;
        default:
      }
      res.status(202);
      res.json();
    }

  };
};

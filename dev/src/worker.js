var ffmpeg     = require('fluent-ffmpeg');
var fs         = require('fs');
var request    = require('request');
var rp         = require('request-promise');
var sequential = require('promise-sequential');
var tmp        = require('tmp');

var VIAMO_API_URL  = process.env.VIAMO_API_URL  || 'https://go.votomobile.org/api/v1/';
var ZAMMAD_API_URL = process.env.ZAMMAD_API_URL || 'https://answers.uliza.fm/api/v1/';

var db;

function postViamoAudio(ticket, input) {
  return new Promise((resolve, reject) => {
    var tmpfile = tmp.fileSync();
    ffmpeg().input(input)
      .outputFormat('wav')
      .output(fs.createWriteStream(tmpfile.name))
      .on('end', () => {
        fs.createReadStream(tmpfile.name)
          .pipe(request.post({
            url: VIAMO_API_URL + 'audio_files',
            qs: {
              'description': ticket.campaign_name,
              'file_extension': 'wav',
              'language_id': ticket.language_id,
              'api_key': ticket.viamo_api_key
            },
            json: true
          }, (error, response, body) => {
            if (error) {
              reject(error);
            } else {
              if (200 != response.statusCode) {
                return reject('Viamo audio upload failed with response code: ' + response.statusCode);
              }
              resolve(response);
            }
          })
        );
      })
      .on('error', error => {
        reject(error);
      })
      .run();
  });
}

function scheduleResponse(ticket, audio) {
  var suveryId, answerId;
  console.log(audio);
  return rp({
    method: 'POST',
    uri: VIAMO_API_URL + 'surveys',
    body: { survey_title: 'Uliza Answers Response (ticket #' + ticket.zammad_id + ')' },
    headers: { api_key: ticket.viamo_api_key },
    json: true
  })
  .then(response => {
    surveyId = response.data;
    console.log('Survey ID : ' + surveyId);
    // Question
    var uri = VIAMO_API_URL + 'surveys/' + surveyId + '/questions'
        + '?audio_file[' + ticket.language_id + ']=' + audio.question
        + '&options[]='
    console.log(uri);
    return rp({
      method: 'POST',
      uri: uri,
      body: {
        response_type: 4,
        question_title: 'Uliza Answers (Question)'
      },
      headers: { api_key: ticket.viamo_api_key },
      json: true
    });
  })
  .then(() => {
    // Answer
    var uri = VIAMO_API_URL + 'surveys/' + surveyId + '/questions'
        + '?audio_file[' + ticket.language_id + ']=' +  audio.answer
        + '&options[]=';
    console.log(uri);
    return rp({
      method: 'POST',
      uri: uri,
      body: {
        response_type: 4,
        question_title: 'Uliza Answers (Answer)'
      },
      headers: { api_key: ticket.viamo_api_key },
      json: true
    });
  })
  .then(response => {
    answerId = response.data;
    // Intro
    var uri = VIAMO_API_URL + 'surveys/' + surveyId + '/introduction'
        + '?audio_file[' + ticket.language_id + ']=' +  audio.intro;
    console.log(uri);
    return rp({
      method: 'POST',
      uri: uri,
      headers: { api_key: ticket.viamo_api_key },
      json: true
    });
  })
  .then(response => {
    // Conclusion
    var uri = VIAMO_API_URL + 'surveys/' + surveyId + '/conclusion'
        + '?audio_file[' + ticket.language_id + ']=' +  audio.conclusion;
    console.log(uri);
    return rp({
      method: 'POST',
      uri: uri,
      headers: { api_key: ticket.viamo_api_key },
      json: true
    });
  })
  .then(response => {
    // Satisfied?
    var uri = VIAMO_API_URL + 'surveys/' + surveyId + '/questions'
        + '?audio_file[' + ticket.language_id + ']=' +  audio.satisfied
        + '&options[0]=Yes&options[1]=No&options[2]=Repeat&condition[0]=1,conclude&condition[1]=2,conclude&condition[2]=3,'
        + answerId;
    console.log(uri);
    return rp({
      method: 'POST',
      uri: uri,
      headers: { api_key: ticket.viamo_api_key },
      body: {
        response_type: 1,
        question_title: 'Uliza Answers (Feedback)'
      },
      json: true
    });
  })
  .then(() => {
    // Schedule call
    console.log({ survey_id: surveyId, send_to_phones: ticket.subscriber_phone });
    return rp({
      method: 'POST',
      uri: VIAMO_API_URL + 'outgoing_calls',
      body: {
        survey_id: surveyId,
        send_to_phones: ticket.subscriber_phone
      },
      headers: { api_key: ticket.viamo_api_key },
      json: true
    });
  })
  .then(response => {
    console.log('Outgoing call scheduled: ' + response.data);
  });
}

function monitor(ticket) {
  process.stdout.write('' + ticket.zammad_id);
  return rp({
    uri: ZAMMAD_API_URL + 'tickets/' + ticket.zammad_id + '/?all=true',
    headers: {
      Authorization: 'Token token=' + process.env.ZAMMAD_API_TOKEN
    },
    json: true
  })
  .then(response => {
    var assets = response.assets;
    var zammad = assets.Ticket[ticket.zammad_id];
    var articles = assets.TicketArticle;
    var wasClosed = ticket.state_id != zammad.state_id
        && 'closed' == response.assets.TicketState[zammad.state_id].name;
    if (ticket.state_id != zammad.state_id
        || ticket.article_count != zammad.article_count)
    { // State or article count has changed
      var query = 'UPDATE tickets SET article_count = ?, state_id = ? WHERE id = ?;';
      db.run(query, zammad.article_count, zammad.state_id, ticket.id);
    }
    if (wasClosed) {
      console.log('\nTicket closed: ' + zammad.id);
      //
      // Check for linked tickets?

      // Extract audio
      var isAudio = function(file) {
        if (!file) return false;
        return /^.+\.(wav|mp3|mp4|ogg|ul|webm)$/.test(file);
      }
      var audio = [];
      Object.keys(articles).forEach(key => {
        var article = articles[key];
        if (article.attachments) {
          article.attachments.forEach(attachment => {
            if (isAudio(attachment.filename)) {
              audio.push({
                articleId: article.id,
                attachmentId: attachment.id
              });
            }
          });
        }
      });
      return Promise.all(
        audio
          .filter(answer => answer.articleId != ticket.first_article_id)
          .map(answer => {
            var audio = {};
            var zammadUrl = ZAMMAD_API_URL + 'ticket_attachment'
              + '/' + ticket.zammad_id
              + '/' + answer.articleId
              + '/' + answer.attachmentId;
            // Post answer audio
            console.log(zammadUrl);
            return postViamoAudio(ticket, request.get({
              url: zammadUrl,
              encoding: null,
              headers: {
                Authorization: 'Token token=' + process.env.ZAMMAD_API_TOKEN
              }
            }))
            .then(response => {
              audio.answer = response.body.data;
              // Post question audio
              return postViamoAudio(ticket, request.get({
                url: ticket.audio_url,
                encoding: null,
                headers: { api_key: process.env.VIAMO_API_KEY }
              }));
            })
            .then(response => {
              audio.question = response.body.data;
              var ids = ticket.viamo_audio.split(':');
              audio.intro = ids[0];
              audio.conclusion = ids[1];
              audio.satisfied = ids[2];
              return audio;
            });
        })
      )
      .then(responses => {
        return Promise.all(
          responses.map(response => {
            return scheduleResponse(ticket, response)
              .then(() => {
                console.log('Un-monitoring ticket #' + ticket.id);
                return db.run('UPDATE tickets SET monitor = 0 WHERE id = ?;', ticket.id);
              });
          }));
      });
    }
  });
}

function poll() {
  return Promise
    .resolve()
    .then(() => {
      process.stdout.write('.');
      return db.all('SELECT tickets.*, campaigns.language_id, campaigns.viamo_api_key, campaigns.viamo_audio, campaigns.id as campaign_id, campaigns.name as campaign_name FROM tickets JOIN campaigns on tickets.campaign_id = campaigns.id WHERE tickets.monitor = 1;');
    })
    .then(results => {
      return sequential(
        results.map(ticket => () => monitor(ticket))
      );
    })
    .then(() => {
      setTimeout(() => poll(), 4000);
    })
    .catch(error => {
      console.error(error.message);
      setTimeout(() => poll(), 4000);
    });
}

module.exports = function(conn) {
  db = conn; return {

    work: function() {
      poll();
    }

  };
};

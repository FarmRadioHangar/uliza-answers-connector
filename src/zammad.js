var requestJson = require('request-json');
var api         = require('./api');

var ZAMMAD_API_TOKEN = process.env.ZAMMAD_API_TOKEN;
var ZAMMAD_API_URL = process.env.ZAMMAD_API_URL ||
  'https://answers.uliza.fm/api/v1/';

var zammad = requestJson.createClient(ZAMMAD_API_URL);

zammad.headers['Authorization'] = 'Token token=' + ZAMMAD_API_TOKEN;

module.exports = {

  get: function(uri, options) {
    return api.makeRequest(zammad, uri, options, 'GET');
  },

  post: function(uri, data, options) {
    return api.makeRequest(zammad, uri, options, 'POST', data);
  },

  put: function(uri, data, options) {
    return api.makeRequest(zammad, uri, options, 'PUT', data);
  },

  patch: function(uri, data, options) {
    return api.makeRequest(zammad, uri, options, 'PATCH', data);
  },

  getTicketAttachment: function(ticketId, articleId, attachmentId) {
    return request.get({
      url: ZAMMAD_API_URL + 'ticket_attachment/' + ticketId
                                           + '/' + articleid
                                           + '/' + attachmentId,
      encoding: null,
      headers: {Authorization: 'Token token=' + ZAMMAD_API_TOKEN}
    });
  }

};

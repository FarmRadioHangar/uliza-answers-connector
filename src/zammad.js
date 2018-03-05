var requestJson = require('request-json');
var api = require('./api');

var ZAMMAD_API_TOKEN = process.env.ZAMMAD_API_TOKEN;
var ZAMMAD_API_URL = process.env.ZAMMAD_API_URL || 
  'https://answers.uliza.fm/api/v1/';

var zammad = requestJson.createClient(ZAMMAD_API_URL);

zammad.headers['Authorization'] = 'Token token=' + ZAMMAD_API_TOKEN;

module.exports = {

  get: function(uri, respCodes) {
    return api.makeRequest(zammad, uri, respCodes, 'GET');
  },

  post: function(uri, data, respCodes) {
    return api.makeRequest(zammad, uri, respCodes, 'POST', data);
  },

  put: function(uri, data, respCodes) {
    return api.makeRequest(zammad, uri, respCodes, 'PUT', data);
  },

  patch: function(uri, data, respCodes) {
    return api.makeRequest(zammad, uri, respCodes, 'PATCH', data);
  }

};

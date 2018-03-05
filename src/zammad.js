var requestJson = require('request-json');
var api = require('./api');

var ZAMMAD_API_TOKEN = process.env.ZAMMAD_API_TOKEN;
var ZAMMAD_API_URL = process.env.ZAMMAD_API_URL || 
  'https://answers.uliza.fm/api/v1/';

var zammad = requestJson.createClient(ZAMMAD_API_URL);

zammad.headers['Authorization'] = 'Token token=' + ZAMMAD_API_TOKEN;

function zammadGet(uri, respCodes) {
  return api.makeRequest(zammad, uri, respCodes, 'GET');
}

function zammadPost(uri, data, respCodes) {
  return api.makeRequest(zammad, uri, respCodes, 'POST', data);
}

function zammadPut(uri, data, respCodes) {
  return api.makeRequest(zammad, uri, respCodes, 'PUT', data);
}

function zammadPatch(uri, data, respCodes) {
  return api.makeRequest(zammad, uri, respCodes, 'PATCH', data);
}

module.exports = {
  get: zammadGet,
  post: zammadPost,
  put: zammadPut,
  patch: zammadPatch
};

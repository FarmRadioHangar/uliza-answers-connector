var requestJson = require('request-json');
var api = require('./api');

var VIAMO_API_KEY = process.env.VIAMO_API_KEY;
var VIAMO_API_URL = process.env.VIAMO_API_URL || 
  'https://go.votomobile.org/api/v1/';

var viamo = requestJson.createClient(VIAMO_API_URL);

viamo.headers['api_key'] = VIAMO_API_KEY;

module.exports = {

  get: function(uri, respCodes) {
    return api.makeRequest(viamo, uri, respCodes, 'GET');
  },

  post: function(uri, data, respCodes) {
    return api.makeRequest(viamo, uri, respCodes, 'POST', data);
  },

  put: function(uri, data, respCodes) {
    return api.makeRequest(viamo, uri, respCodes, 'PUT', data);
  },

  patch: function(uri, data, respCodes) {
    return api.makeRequest(viamo, uri, respCodes, 'PATCH', data);
  },

  deliveryStatus: function(code) {
    switch (code) {
      case 1: return  ['Queued', ''];
      case 2: return  ['Ringing', ''];
      case 3: return  ['In Progress', ''];
      case 4: return  [
        'Waiting to retry',
        'Call not connected on previous attempt, will retry'];
      case 5: return  [
        'Failed (No Answer)',
        'Call was not answered'];
      case 6: return  [
        'Finished (Complete)',
        'Call was answered, and subscriber hung up after completing the content'];
      case 7: return  [
        'Finished (Incomplete)',
        'Call was answered, but subscriber hung up without completing the content'];
      case 8: return  [
        'Failed (No Viamo Credit)',
        'Insufficient credit to complete call'];
      case 9: return  [
        'Failed (Network)',
        'Call failed due to network conditions beyond Viamo'];
      case 10: return [
        'Failed (Cancelled)',
        'Account user cancelled the call'];
      case 11: return [
        'Sent',
        'Only relevant for SMS: sent to gateway, with no delivery report yet'];
      case 12: return [
        'Finished (Voicemail)',
        'Reached voicemail; Played the prompt message into voicemail'];
      case 13: return [
        'Failed (Voicemail)',
        'Call hung up on reaching voicemail'];
      case 14: return ['Failed (Error)', ''];
      default: return ['Invalid Status Code', ''];
    }
  }

};

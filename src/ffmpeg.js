var base64 = require('base64-stream');
var ffmpeg = require('fluent-ffmpeg');

module.exports = {

  command: function(options) {
    return ffmpeg(options);
  },

  encodeAudio: function(url) {
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

};

var sqlite = require('sqlite');

var db;

module.exports = {

  init: function() {
    return sqlite.open('db.sqlite')
    .then(function(connection) {
      db = connection;
      return db.run('CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY, zammad_id INTEGER, subscriber_phone TEXT, audio TEXT, created_at TEXT);')
    });
  },

  createTicket: function(zammadId, subscriber, audio) {
    return db.run(
      'INSERT INTO tickets (zammad_id, subscriber_phone, audio, created_at) VALUES (?, ?, ?, DATETIME(\'now\'));', zammadId, subscriber, audio
    );
  }

};

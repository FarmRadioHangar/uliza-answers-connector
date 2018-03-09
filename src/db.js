var sqlite = require('sqlite');

var db;

module.exports = {

  init: function() {
    return sqlite.open('db.sqlite')
    .then(function(connection) {
      db = connection;
      return db.run('CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY, zammad_id INTEGER, subscriber_phone TEXT, audio TEXT, articles INTEGER, created_at TEXT);')
    });
  },

  createTicket: function(zammadId, subscriber, audio) {
    return db.run(
      'INSERT INTO tickets (zammad_id, subscriber_phone, audio, articles, created_at) VALUES (?, ?, ?, 1, DATETIME(\'now\'));', zammadId, subscriber, audio
    );
  },

  updateArticlesCount(id, count) {
    return db.run(
      'UPDATE tickets SET articles = ? WHERE id = ?;', count, id
    );
  },

  getTickets: function() {
    return db.all('SELECT * FROM tickets;');
  }

};

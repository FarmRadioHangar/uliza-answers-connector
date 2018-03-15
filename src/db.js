var sqlite = require('sqlite');

var db;

module.exports = {

  init: function() {
    return sqlite.open('db.sqlite')
    .then(function(connection) {
      db = connection;
      return db.run('CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY, zammad_id INTEGER, subscriber_phone TEXT, audio TEXT, articles INTEGER, created_at TEXT);')
    })
    .then(function() {
      return db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, auth0_user_id INTEGER, zammad_token TEXT, firebase_login TEXT, sip_user TEXT, created_at TEXT);')
    });
  },

  createTicket: function(zammadId, phone, audio) {
    return db.run(
      'INSERT INTO tickets (zammad_id, subscriber_phone, audio, articles, created_at) VALUES (?, ?, ?, 1, DATETIME(\'now\'));', zammadId, phone, audio
    );
  },

  updateArticlesCount(id, count) {
    return db.run(
      'UPDATE tickets SET articles = ? WHERE id = ?;', count, id
    );
  },

  getTickets: function() {
    return db.all('SELECT * FROM tickets;');
  },

  createUser: function(auth0Id, zammadToken, firebaseLogin, sipUser) {
    return db.run(
      'INSERT INTO users (auth0_user_id, zammad_token, firebase_login, sip_user, created_at) VALUES (?, ?, ?, ?, DATETIME(\'now\'));', auth0Id, zammadToken, firebaseLogin, sipUser
    );
  }

};

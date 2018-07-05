var path   = require('path');
var sqlite = require('sqlite');

module.exports = {

  init: function() {
    var db;
    return sqlite
      .open(path.join(__dirname, '../', 'db.sqlite'))
      .then(conn => { db = conn; })
      .then(() => db.run('CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY, zammad_id INTEGER, subscriber_phone TEXT, articles_count INTEGER, state INTEGER, created_at TEXT);'))
      .then(() => db.run('CREATE TABLE IF NOT EXISTS campaigns (id INTEGER PRIMARY KEY, name TEXT, language_id INTEGER, viamo_api_key TEXT, viamo_tree_id INTEGER, viamo_tree_block_id INTEGER, viamo_audio TEXT, zammad_group TEXT, created_at TEXT);'))
      .then(() => db.run('CREATE TABLE IF NOT EXISTS agents (id INTEGER PRIMARY KEY, campaign_id INTEGER, email TEXT, auth0_user_id TEXT, created_at TEXT);'))
      .then(() => db.run('CREATE INDEX IF NOT EXISTS auth0_user_ids ON agents (auth0_user_id);'))
      .then(() => db);
  }

};

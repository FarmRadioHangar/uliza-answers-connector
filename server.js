require('dotenv').config();

var bodyparser  = require('body-parser');
var chalk       = require('chalk');
var express     = require('express');

var app = express();

app.use(bodyparser.urlencoded({extended: true}));
app.use(bodyparser.json());

var SERVER_PORT    = process.env.PORT || 8099;
var ZAMMAD_API_KEY = process.env.ZAMMAD_API_TOKEN;
var VIAMO_API_KEY  = process.env.VIAMO_API_KEY;

var router = express.Router();

app.use(router);
app.listen(SERVER_PORT);

console.log(
  chalk.bold.yellow('Uliza Answers connector listening on port ' + SERVER_PORT)
);

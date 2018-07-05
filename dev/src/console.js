require('dotenv').config();

var auth0Client = require('auth0').ManagementClient;
var fs          = require('fs');
var path        = require('path');
var pgen        = require('password-generator');
var request     = require('request');
var prequest    = require('request-promise');
var term        = require('terminal-kit').terminal;
var database    = require('./db');

var VIAMO_API_URL = process.env.VIAMO_API_URL ||
  'https://go.votomobile.org/api/v1/';

var auth0 = new auth0Client({
  domain: 'farmradio.eu.auth0.com',
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  scope: 'read:users read:users_app_metadata',
});

term.grabInput();

term.on('key', key => {
  if (key === 'CTRL_C') {
    process.exit();
  }
});

var OPTION = {
  HOME            : 'HOME',
  SELECT_CAMPAIGN : 'SELECT_CAMPAIGN',
  CREATE_CAMPAIGN : 'CREATE_CAMPAIGN',
  DELETE_CAMPAIGN : 'DELETE_CAMPAIGN',
  EDIT_CAMPAIGN   : 'EDIT_CAMPAIGN',
  MANAGE_AGENTS   : 'MANAGE_AGENTS',
  CREATE_AGENT    : 'CREATE_AGENT',
  DELETE_AGENT    : 'DELETE_AGENT',
  EDIT_AGENT      : 'EDIT_AGENT'
};

var db, key;
var banner = '\n\n\n Uliza Answers Console\n';

function viamoFetch(endpoint) {
  return prequest({
    uri: `${VIAMO_API_URL}${endpoint}`,
    headers: { 'api_key': key }
  });
}

function uploadViamoAudio(file, language, extension) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(path.join(__dirname, '../', 'audio', file))
      .pipe(request.post({
        url: `${VIAMO_API_URL}audio_files/`,
        qs: {
          'description': 'Uliza Answers audio',
          'file_extension': extension || 'mp3',
          'language_id': language.id,
          'api_key': key 
        },
        json: true
      }, (error, response, body) => {
        if (error) {
          reject(error);
        } else {
          if (200 == response.statusCode) {
            resolve(body.data);
          } else {
            reject(body);
          }
        }
      }));
  });
}

function zammadRequest(endpoint, options) {
  options.uri = `https://answers.uliza.fm/api/v1/${endpoint}`;
  options.headers = options.headers || {};
  options.headers['Authorization'] = `Token token=${process.env.ZAMMAD_API_TOKEN}`;
  return prequest(options);
};

var createCampaign = (function(){
  var campaign, language, tree, block, audio;
  var STATE = {
    GET_NAME          : 'GET_NAME',
    GET_KEY           : 'GET_KEY',
    CHECK_KEY         : 'CHECK_KEY',
    FETCH_LANGUAGES   : 'FETCH_LANGUAGES',
    FETCH_TREES       : 'FETCH_TREES',
    FETCH_TREE_BLOCKS : 'FETCH_TREE_BLOCKS',
    UPLOAD_AUDIO      : 'UPLOAD_AUDIO',
    SAVE_CAMPAIGN     : 'SAVE_CAMPAIGN'
  };
  return function moveState(state) {
    term.clear();
    term(banner);
    term.bold(' • Create new campaign\n');
    switch (state) {
        // --------------------------------------------------------------------
      case STATE.GET_NAME:
        term('\n Campaign name: ');
        term.inputField((error, input) => {
          if (!input) {
            menu(OPTION.HOME, 1);
          } else {
            campaign = input;
            moveState(STATE.GET_KEY);
          }
        });
        break;
        // --------------------------------------------------------------------
      case STATE.GET_KEY:
        term('\n Viamo API key: ');
        term.inputField((error, input) => {
          if (!input) {
            moveState(STATE.GET_KEY);
          } else {
            key = input;
            moveState(STATE.CHECK_KEY);
          }
        });
        break;
        // --------------------------------------------------------------------
      case STATE.CHECK_KEY:
        term('\n Checking API key...');
        viamoFetch('ping')
          .then(() => { 
            moveState(STATE.FETCH_LANGUAGES); 
          })
          .catch(error => {
            if (error.response && 403 == error.response.statusCode) {
              term.white('\n ✗ The key was not recognized by Viamo.\n');
              term.singleColumnMenu([
                'Change key', // 0
                'Cancel'      // 1
              ], { leftPadding: ' ' }, (error, response) => {
                switch (response.selectedIndex) {
                  case 0:
                    moveState(STATE.GET_KEY);
                    break;
                  default:
                    menu(OPTION.HOME);
                }
              });
            } else {
              term.white('\n ✗ Failed connecting to Viamo.\n');
              if ('EAI_AGAIN' === error.error.code) {
                term(' Are you connected to the Internet?\n');
              }
              term.singleColumnMenu([
                'Try again', // 0
                'Cancel'     // 1
              ], { leftPadding: ' ' }, (error, response) => {
                switch (response.selectedIndex) {
                  case 0:
                    moveState(STATE.CHECK_KEY);
                    break;
                  default:
                    menu(OPTION.HOME);
                }
              });
            }
          });
        break;
        // --------------------------------------------------------------------
      case STATE.FETCH_LANGUAGES:
        term('\n Fetching languages...');
        viamoFetch('languages')
          .then(response => {
            var languages = JSON.parse(response).data.languages;
            term.up(2);
            term.saveCursor();
            term('\n\n Select campaign language:\n =========================\n');
            term.singleColumnMenu(
              languages.map(lang => `${lang.id}\t${lang.name}`), 
              (error, response) => {
                language = languages[response.selectedIndex];
                moveState(STATE.FETCH_TREES);
              });
          });
        break;
      case STATE.FETCH_TREES:
        // --------------------------------------------------------------------
        term('\n Fetching Viamo trees...');
        viamoFetch('trees')
          .then(response => {
            var trees = JSON.parse(response).data.trees;
            term.up(2);
            term.saveCursor();
            term('\n\n Select the campaign tree:\n =========================\n');
            var options = trees.map(tree => `${tree.id}\t${tree.title}`);
            term.singleColumnMenu(['↖ Back'].concat(options),
              (error, response) => {
                switch (response.selectedIndex) {
                  case 0:
                    moveState(STATE.FETCH_LANGUAGES);
                    break;
                  default:
                    tree = trees[response.selectedIndex - 1];
                    moveState(STATE.FETCH_TREE_BLOCKS);
                }
              });
          });
        break;
        // --------------------------------------------------------------------
      case STATE.FETCH_TREE_BLOCKS:
        term.restoreCursor();
        term.saveCursor();
        term.eraseDisplayBelow();
        term.bold(`\n\n ${tree.title}: `);
        term(`${tree.description}`);
        term('\n\n Fetching tree blocks...');
        viamoFetch(`trees/${tree.id}/blocks`)
          .then(response => {
            term.up(2);
            term('\n\n Select the user question tree block:\
\n ====================================\n');
            var blocks = JSON.parse(response).data.blocks;
            blocks = blocks && blocks.filter(
              block => 'Open-Ended Question' === block.type
            );
            if (!blocks || !blocks.length) {
              term.white(
                '\n ✗ No open-ended questions were found in this tree.\n'
              );
              term.singleColumnMenu([
                'Change tree', // 0
                'Cancel'       // 1
              ], { leftPadding: ' ' }, (error, response) => {
                switch (response.selectedIndex) {
                  case 0:
                    moveState(STATE.FETCH_TREES);
                    break;
                  default:
                    menu(OPTION.HOME);
                }
              });
            } else {
              term.singleColumnMenu(['Go back'].concat(blocks.map(
                block => `${block.id} ${block.details.title}`)), 
                (error, response) => {
                  switch (response.selectedIndex) {
                    case 0:
                      moveState(STATE.FETCH_TREES);
                      break;
                    default:
                      block = blocks[response.selectedIndex - 1];
                      moveState(STATE.UPLOAD_AUDIO);
                  }
                });
            }
          });
        break;
        // --------------------------------------------------------------------
      case STATE.UPLOAD_AUDIO:
        term.restoreCursor();
        term.eraseDisplayBelow();
        term('\n\n Uploading Viamo audio...\n');
        Promise.resolve()
          .then(() => {
            term(' 1/3\n');
            return uploadViamoAudio('intro_audio.mp3', language)
          })
          .then(response => {
            term.up();
            term(' 2/3\n');
            audio = response;
            return uploadViamoAudio('conclusion_audio.mp3', language)
          })
          .then(response => {
            term.up();
            term(' 3/3\n');
            audio = `${audio}:${response}`;
            return uploadViamoAudio('satisfied_audio.mp3', language)
          })
          .then(response => {
            audio = `${audio}:${response}`;
            moveState(STATE.SAVE_CAMPAIGN);
          });
        break;
        // --------------------------------------------------------------------
      case STATE.SAVE_CAMPAIGN:
        term.restoreCursor();
        term.eraseDisplayBelow();
        var query = `
          INSERT INTO campaigns 
            ( name
            , language_id
            , viamo_api_key
            , viamo_tree_id
            , viamo_tree_block_id
            , viamo_audio
            , zammad_group
            , created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'Ghana Farming', DATETIME('now'));`;
        db.run(query, campaign, language.id, key, tree.id, block.id, audio)
          .then(() => {
            term(`\n\n ✓ Campaign ${campaign} successfully saved.\n`);
            term.singleColumnMenu([
              'Continue' // 0
            ], { leftPadding: ' ' }, 
              (error, response) => { menu(OPTION.HOME); }
            );
          });
        break;
      default:
        moveState(STATE.GET_NAME);
    }
  }
}());

var createAgent = (function(){
  var firstname, lastname, password, userpw, auth0user, zammad, email, username, firebase, sip;
  var STATE = {
    GET_FIRSTNAME      : 'GET_FIRSTNAME',
    GET_LASTNAME       : 'GET_LASTNAME',
    GET_EMAIL          : 'GET_EMAIL',
    GET_USERNAME       : 'GET_USERNAME',
    LOOKUP_AUTH0_USER  : 'LOOKUP_AUTH0_USER',
    CREATE_AUTH0_USER  : 'CREATE_AUTH0_USER',
    GET_FIREBASE_TOKEN : 'GET_FIREBASE_TOKEN',
    GET_SIP_USERNAME   : 'GET_SIP_USERNAME',
    GET_SIP_PASSWORD   : 'GET_SIP_PASSWORD',
    GET_SIP_HOST       : 'GET_SIP_HOST',
    CREATE_ZAMMAD_USER : 'CREATE_ZAMMAD_USER',
    UPDATE_AUTH0_USER  : 'UPDATE_AUTH0_USER',
    SAVE_AGENT         : 'SAVE_AGENT'
  };
  return function moveState(state) {
    term.clear();
    term(banner);
    term(` • ${selectedCampaign.name}\n`);
    term.bold(' • Create new agent\n');
    switch (state) {
        // --------------------------------------------------------------------
      case STATE.GET_EMAIL:
        term('\n Email address: ');
        term.inputField((error, input) => {
          if (!input) {
            menu(OPTION.EDIT_CAMPAIGN, 3);
          } else {
            email = input;
            db.all('SELECT * FROM agents WHERE campaign_id = ? AND email = ?;', 
              selectedCampaign.id, email).then(results => {
                if (results.length) {
                  term.up(2);
                  term.eraseDisplayBelow();
                  term.white('\n\n ✗ This user already exists.\n');
                  term.singleColumnMenu([
                    'Ok' // 0
                  ], { leftPadding: ' ' }, 
                    (error, response) => { 
                      menu(OPTION.EDIT_CAMPAIGN, 3);
                    }
                  );
                } else {
                  moveState(STATE.LOOKUP_AUTH0_USER);
                }
              });
          }
        });
        break;
        // --------------------------------------------------------------------
      case STATE.LOOKUP_AUTH0_USER:
        term('\n Looking up email address in Auth0...');
        auth0.getUsersByEmail(email)
          .then(results => {
            if (results.length) {
              term.white(`\n The email address ${email} already exists in Auth0. \
Select a user account to import from the list below. \n`);
              var users = results.map(user => `${user.username}\t${user.user_id}`);
              term.singleColumnMenu(['Cancel'].concat(users),
                (error, response) => {
                  switch (response.selectedIndex) {
                    case 0:
                      menu(OPTION.EDIT_CAMPAIGN, 3);
                      break;
                    default:
                      auth0user = results[response.selectedIndex - 1];
                      console.log(auth0user);
                      moveState(STATE.GET_FIRSTNAME);
                  }
                });
            } else {
              moveState(STATE.GET_FIRSTNAME);
            }
          }).catch(error => {
            term(`\n ${error.message}\n`);
            term.singleColumnMenu([
              'Retry', // 0
              'Cancel' // 1
            ], { leftPadding: ' ' }, (error, response) => {
              switch (response.selectedIndex) {
                case 0:
                  moveState(STATE.GET_EMAIL);
                  break;
                default:
                  menu(OPTION.EDIT_CAMPAIGN, 3);
              }
            });
          });
        break;
        // --------------------------------------------------------------------
      case STATE.GET_FIRSTNAME:
        if (auth0user && auth0user.given_name && auth0user.family_name) {
          firstname = auth0user.given_name;
          lastname = auth0user.family_name;
          moveState(STATE.GET_USERNAME);
        } else {
          term('\n First name: ');
          term.inputField((error, input) => {
            if (!input) {
              moveState(STATE.GET_FIRSTNAME);
            } else {
              firstname = input;
              moveState(STATE.GET_LASTNAME);
            }
          });
        }
        break;
        // --------------------------------------------------------------------
      case STATE.GET_LASTNAME:
        term('\n Last name: ');
        term.inputField((error, input) => {
          if (!input) {
            moveState(STATE.GET_LASTNAME);
          } else {
            lastname = input;
            moveState(STATE.GET_USERNAME);
          }
        });
        break;
        // --------------------------------------------------------------------
      case STATE.GET_USERNAME:
        if (auth0user && auth0user.username) {
          username = auth0user.username;
          moveState(STATE.CREATE_AUTH0_USER);
        } else {
          term('\n Username: ');
          term.inputField({ default: email.split('@')[0] }, 
            (error, input) => {
              if (!input) {
                moveState(STATE.GET_USERNAME);
              } else {
                username = input;
                moveState(STATE.CREATE_AUTH0_USER);
              }
            });
        }
        break;
        // --------------------------------------------------------------------
      case STATE.CREATE_AUTH0_USER:
        term.saveCursor();
        if (auth0user) {
          moveState(STATE.GET_FIREBASE_TOKEN);
        } else {
          userpw = pgen(24, false);
          auth0.createUser({
            connection: 'Username-Password-Authentication',
            username: username,
            email: email, 
            given_name: firstname,
            family_name: lastname,
            name: `${firstname} ${lastname}`,
            password: userpw,
            email_verified: false, 
            app_metadata: {} 
          }).then(response => {
            auth0user = response;
            moveState(STATE.GET_FIREBASE_TOKEN);
          }).catch(error => {
            term(`\n ${error.message}\n`);
            term.singleColumnMenu([
              'Retry', // 0
              'Cancel' // 1
            ], { leftPadding: ' ' }, (error, response) => {
              switch (response.selectedIndex) {
                case 0:
                  moveState(STATE.GET_USERNAME);
                  break;
                default:
                  menu(OPTION.EDIT_CAMPAIGN, 3);
              }
            });
          });
        }
        break;
        // --------------------------------------------------------------------
      case STATE.GET_FIREBASE_TOKEN:
        term('\n Firebase token: ');
        term.inputField((error, input) => {
          firebase = { token: input };
          moveState(STATE.GET_SIP_USERNAME);
        });
        break;
        // --------------------------------------------------------------------
      case STATE.GET_SIP_USERNAME:
        term('\n SIP username: ');
        term.inputField((error, input) => {
          sip = { user: input };
          moveState(STATE.GET_SIP_PASSWORD);
        });
        break;
        // --------------------------------------------------------------------
      case STATE.GET_SIP_PASSWORD:
        term('\n SIP password: ');
        term.inputField((error, input) => {
          sip.pass = input;
          moveState(STATE.GET_SIP_HOST);
        });
        break;
        // --------------------------------------------------------------------
      case STATE.GET_SIP_HOST:
        term('\n SIP host (default: wazo.uliza.fm:50602): ');
        term.inputField((error, input) => {
          if (!input) {
            sip.host = 'wazo.uliza.fm:50602';
          } else {
            sip.host = input;
          }
          moveState(STATE.CREATE_ZAMMAD_USER);
        });
        break;
        // --------------------------------------------------------------------
      case STATE.CREATE_ZAMMAD_USER:
        term('\n Creating Zammad user...');
        password = pgen(24, false);
        var options = {
          method: 'POST',
          body: {
           'firstname': firstname,
           'lastname': lastname, 
           'password': password
          },
          json: true
        };
        zammadRequest('users', options)
          .then(response => {
            zammad = response;
            moveState(STATE.UPDATE_AUTH0_USER);
          });
        break;
        // --------------------------------------------------------------------
      case STATE.UPDATE_AUTH0_USER:
        term('\n Updating Auth0 user metadata...');
        var userinfo = {
          given_name: firstname,
          family_name: lastname,
          name: `${firstname} ${lastname}`
        };
        var metadata = {
          zammad_id: zammad.id,
          zammad_login: zammad.login,
          zammad_password: password,          //zammad_token: '',
          firebase_token: firebase.token,
          sip_username: sip.user,
          sip_password: sip.pass,
          sip_host: sip.host
        };
        auth0.updateUserMetadata({ id: auth0user.user_id }, userinfo)
          .then(() => {
            auth0.updateAppMetadata({ id: auth0user.user_id }, metadata)
              .then(response => { moveState(STATE.SAVE_AGENT); })
              .catch(error => {
                term(`\n ${error.message}\n`);
                term.singleColumnMenu([
                  'Retry', // 0
                  'Cancel' // 1
                ], { leftPadding: ' ' }, (error, response) => {
                  switch (response.selectedIndex) {
                    case 0:
                      moveState(STATE.UPDATE_AUTH0_USER);
                      break;
                    default:
                      menu(OPTION.EDIT_CAMPAIGN, 3);
                  }
                });
              });
          });
        break;
        // --------------------------------------------------------------------
      case STATE.SAVE_AGENT:
        term.restoreCursor();
        term.eraseDisplayBelow();
        var query = `
          INSERT INTO agents
            ( campaign_id
            , auth0_user_id
            , email
            , created_at
            ) VALUES (?, ?, ?, DATETIME('now'));`;
        db.run(query, selectedCampaign.id, auth0user.user_id, email)
          .then(() => {
            term(`\n ✓ Agent ${username} successfully saved.\n\n`);
            term(` Auth0 ID : ${auth0user.user_id}\n`);
            term(` Email    : ${email}\n`);
            term(` Username : ${username}\n`);
            if (userpw) {
              term(` Password : ${userpw}\n`);
            }
            term.singleColumnMenu([
              'Continue' // 0
            ], { leftPadding: ' ' }, 
              (error, response) => { menu(OPTION.EDIT_CAMPAIGN, 3); }
            );
          });
        break;
      default:
        moveState(STATE.GET_EMAIL);
    }
  }
}());

var selectedCampaign, selectedAgent;

function menu(item, selected) {
  switch (item) {
      // ----------------------------------------------------------------------
    case OPTION.HOME:
      term.clear();
      term.bold(banner);
      term.singleColumnMenu([
        'Manage campaigns',    // 0
        'Create new campaign', // 1
        'Exit'
      ], {
        selectedIndex: selected
      }, (error, response) => {
        switch (response.selectedIndex) {
          case 0:
            menu(OPTION.SELECT_CAMPAIGN);
            break;
          case 1:
            menu(OPTION.CREATE_CAMPAIGN);
            break;
          default:
            term.clear();
            process.exit();
        }
      });
      break;
      // ----------------------------------------------------------------------
    case OPTION.SELECT_CAMPAIGN:
      term.clear();
      term(banner);
      term.bold(' • Manage campaigns\n');
      db.all('SELECT * FROM campaigns;').then(results => {
        if (!results.length) {
          term('\n No campaigns found.\n');
        }
        term.gridMenu(['↖ Back'].concat(results.map(
          item => `${item.id} ${item.name}`)), 
          (error, response) => {
            switch (response.selectedIndex) {
              case 0:
                menu(OPTION.HOME);
                break;
              default:
                selectedCampaign = results[response.selectedIndex - 1];
                menu(OPTION.EDIT_CAMPAIGN);
            }
          });
      });
      break;
      // ----------------------------------------------------------------------
    case OPTION.CREATE_CAMPAIGN:
      createCampaign();
      break;
      // ----------------------------------------------------------------------
    case OPTION.EDIT_CAMPAIGN:
      term.clear();
      term(banner);
      term.bold(` • ${selectedCampaign.name}\n\n`);
      term(` Created      : ${selectedCampaign.created_at}\n`);
      term(` Zammad group : ${selectedCampaign.zammad_group}\n`);
      term(` Viamo tree   : https://go.votomobile.org/trees/${selectedCampaign.viamo_tree_id}\n`);
      term.singleColumnMenu([
        '↖ Back',          // 0
        'Delete campaign', // 1
        'Manage agents',   // 2
        'Create new agent' // 3
      ], {
        selectedIndex: selected
      }, (error, response) => {
        switch (response.selectedIndex) {
          case 0:
            menu(OPTION.SELECT_CAMPAIGN);
            break;
          case 1:
            menu(OPTION.DELETE_CAMPAIGN);
            break;
          case 2:
            menu(OPTION.MANAGE_AGENTS);
            break;
          case 3:
            menu(OPTION.CREATE_AGENT);
            break;
          default:
            menu(OPTION.HOME);
        }
      });
      break;
      // ----------------------------------------------------------------------
    case OPTION.DELETE_CAMPAIGN:
      term.clear();
      term(banner);
      term.bold(' • Delete campaign\n');
      term(`\n Delete the campaign ${selectedCampaign.name}? [Y|n] `);
      term.yesOrNo({
        yes: ['y', 'ENTER'],
        no: ['n']
      }, (error, result) => {
        if (result) {
          db.run('DELETE FROM campaigns WHERE ID = ?;', selectedCampaign.id)
            .then(() => {
              term(`\n\n ✓ The campaign has been deleted.\n`);
              term.singleColumnMenu([
                'Continue' // 0
              ], { leftPadding: ' ' }, 
                (error, response) => { menu(OPTION.SELECT_CAMPAIGN); }
              );
            });
        } else {
          menu(OPTION.EDIT_CAMPAIGN, 1);
        }
      });
      break;
      // ----------------------------------------------------------------------
    case OPTION.MANAGE_AGENTS:
      term.clear();
      term(banner);
      term(` • ${selectedCampaign.name}\n`);
      term.bold(' • Manage agents\n');
      db.all('SELECT * FROM agents WHERE campaign_id = ?;', selectedCampaign.id)
        .then(results => {
          if (!results.length) {
            term('\n No agents exist for this campaign.\n');
          }
          term.gridMenu(['↖ Back'].concat(results.map(item => `${item.id} ${item.email}`)), 
            (error, response) => {
            switch (response.selectedIndex) {
              case 0:
                menu(OPTION.EDIT_CAMPAIGN, 2);
                break;
              default:
                selectedAgent = results[response.selectedIndex - 1];
                menu(OPTION.EDIT_AGENT);
            }
          });
        });
      break;
      // ----------------------------------------------------------------------
    case OPTION.CREATE_AGENT:
      createAgent();
      break;
      // ----------------------------------------------------------------------
    case OPTION.EDIT_AGENT:
      term.clear();
      term(banner);
      term(` • ${selectedCampaign.name}\n`);
      term.bold(' • Edit agent\n');
      term(`\n email    : ${selectedAgent.email}`);
      term(`\n Auth0 ID : ${selectedAgent.auth0_user_id}\n`);
      term.singleColumnMenu([
        '↖ Back',      // 0
        'Delete agent' // 1
      ], {
        selectedIndex: selected
      }, (error, response) => {
        switch (response.selectedIndex) {
          case 0:
            menu(OPTION.MANAGE_AGENTS);
            break;
          case 1:
            menu(OPTION.DELETE_AGENT);
            break;
        }
      });
      break;
      // ----------------------------------------------------------------------
    case OPTION.DELETE_AGENT:
      term.clear();
      term(banner);
      term(` • ${selectedCampaign.name}\n`);
      term.bold(' • Delete agent\n');
      term(`\n Delete the agent ${selectedAgent.email}? [Y|n] `);
      term.yesOrNo({
        yes: ['y', 'ENTER'],
        no: ['n']
      }, (error, result) => {
        if (result) {
          db.run('DELETE FROM agents WHERE ID = ?;', selectedAgent.id)
            .then(() => {
              term(`\n\n ✓ The agent has been deleted.\n`);
              term.singleColumnMenu([
                'Continue' // 0
              ], { leftPadding: ' ' }, 
                (error, response) => { menu(OPTION.MANAGE_AGENTS); }
              );
            });
        } else {
          menu(OPTION.EDIT_AGENT, 1);
        }
      });
      break;
  }
}

return database.init()
  .then(conn => { db = conn; })
  .then(() => menu(OPTION.HOME))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

require('dotenv').config();

var auth0Client = require('auth0').ManagementClient;
var fs          = require('fs');
var ora         = require('ora');
var path        = require('path');
var pgen        = require('password-generator');
var prequest    = require('request-promise');
var request     = require('request');
var spinners    = require('cli-spinners');
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
  HOME                 : 'HOME',
  SELECT_CAMPAIGN      : 'SELECT_CAMPAIGN',
  CREATE_CAMPAIGN      : 'CREATE_CAMPAIGN',
  DELETE_CAMPAIGN      : 'DELETE_CAMPAIGN',
  MODIFY_CAMPAIGN      : 'MODIFY_CAMPAIGN',
  EDIT_CAMPAIGN        : 'EDIT_CAMPAIGN',
  MANAGE_AGENTS        : 'MANAGE_AGENTS',
  CREATE_AGENT         : 'CREATE_AGENT',
  DELETE_AGENT         : 'DELETE_AGENT',
  EDIT_AGENT           : 'EDIT_AGENT',
  CHANGE_LANGUAGE      : 'CHANGE_LANGUAGE',
  CHANGE_CAMPAIGN_NAME : 'CHANGE_CAMPAIGN_NAME',
  CHANGE_TREE          : 'CHANGE_TREE',
  CHANGE_GROUP         : 'CHANGE_GROUP'
};

var db, key;
var banner = '\n\n\nUliza Answers Console\n';

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

var modifyCampaign = (function(){
  return function handle(option) {
    key = selectedCampaign.viamo_api_key;
    term.restoreCursor();
    term.eraseDisplayBelow();
    term('\n');
    switch (option) {
        // --------------------------------------------------------------------
      case OPTION.CHANGE_LANGUAGE:
        term('Fetching languages...');
        viamoFetch('languages')
          .then(response => {
            var languages = JSON.parse(response).data.languages;
            term.up(2);
            term.saveCursor();
            term('\n\nSelect campaign language:\n=========================\n');
            term.singleColumnMenu(
              languages.map(lang => `${lang.id}\t${lang.name}`), 
              (error, response) => {
                var language = languages[response.selectedIndex];
                var query = 'UPDATE campaigns SET language_id = ?, language_name = ? WHERE id = ?;';
                db.run(query, language.id, language.name, selectedCampaign.id)
                  .then(() => {
                    selectedCampaign.language_id = language.id;
                    selectedCampaign.language_name = language.name;
                    menu(OPTION.EDIT_CAMPAIGN, 2);
                  });
              });
          })
        break;
        // --------------------------------------------------------------------
      case OPTION.CHANGE_CAMPAIGN_NAME:
        term('Campaign name: ');
        term.inputField({
          default: selectedCampaign.name
        }, (error, input) => {
          if (!input) {
            handle(OPTION.CHANGE_CAMPAIGN_NAME);
          } else if (input == selectedCampaign.name) {
            menu(OPTION.MODIFY_CAMPAIGN, 2);
          } else {
            var name = input;
            var query = 'UPDATE campaigns SET name = ? WHERE id = ?;';
            db.run(query, name, selectedCampaign.id)
              .then(() => {
                selectedCampaign.name = name;
                menu(OPTION.EDIT_CAMPAIGN, 2);
              });
          }
        });
        break;
        // --------------------------------------------------------------------
      case OPTION.CHANGE_TREE:
        var tree;
        term('Fetching Viamo trees...');
        viamoFetch('trees')
          .then(response => {
            var trees = JSON.parse(response).data.trees;
            term.restoreCursor();
            term.saveCursor();
            term('\nSelect the campaign tree:\n=========================\n');
            var options = trees.map(tree => `${tree.id}\t${tree.title}`);
            term.singleColumnMenu(options,
              (error, response) => {
                tree = trees[response.selectedIndex];
                term.restoreCursor();
                term.eraseDisplayBelow();
                term('\nFetching tree blocks...');
                viamoFetch(`trees/${tree.id}/blocks`)
                  .then(response => {
                    term.restoreCursor();
                    term('\nSelect the user question tree block:\
\n====================================\n');
                    var blocks = JSON.parse(response).data.blocks;
                    blocks = blocks && blocks.filter(
                      block => 'Open-Ended Question' === block.type
                    );
                    if (!blocks || !blocks.length) {
                      term.white(
                        '\n✗ No open-ended questions were found in this tree.\n'
                      );
                      term.singleColumnMenu([
                        'Change tree', // 0
                        'Cancel'       // 1
                      ], { leftPadding: ' ' }, (error, response) => {
                        switch (response.selectedIndex) {
                          case 0:
                            handle(OPTION.CHANGE_TREE);
                            break;
                          default:
                            menu(OPTION.MODIFY_CAMPAIGN, 3);
                        }
                      });
                    } else {
                      term.singleColumnMenu(blocks.map(
                        block => `${block.id} ${block.details.title}`), 
                        (error, response) => {
                          var block = blocks[response.selectedIndex];
                          var query = 'UPDATE campaigns SET viamo_tree_id = ?, viamo_tree_block_id = ? WHERE id = ?;';
                          db.run(query, tree.id, block.id, selectedCampaign.id)
                            .then(() => {
                              selectedCampaign.viamo_tree_id = tree.id;
                              selectedCampaign.viamo_tree_block_id = block.id;
                              menu(OPTION.EDIT_CAMPAIGN, 2);
                            });
                        });
                    }
                  });
              });
          });
        break;
        // --------------------------------------------------------------------
      case OPTION.CHANGE_GROUP:
        term('Fetching Zammad groups...');
        zammadRequest('groups', { json: true })
          .then(results => {
            term.up(2);
            term.eraseDisplayBelow();
            term.saveCursor();
            term('\n\nSelect group:\n=============\n');
            var groups = results.map(group => `${group.name}`);
            term.singleColumnMenu(groups, (error, response) => {
              var group = groups[response.selectedIndex];
              var query = 'UPDATE campaigns SET zammad_group = ? WHERE id = ?;';
              db.run(query, group, selectedCampaign.id)
                .then(() => {
                  selectedCampaign.zammad_group = group;
                  menu(OPTION.EDIT_CAMPAIGN, 2);
                });
            });
          });
        break;
    }
  }
}());

var createCampaign = (function(){
  var campaign, language, tree, block, audio, group;
  var STATE = {
    GET_NAME          : 'GET_NAME',
    GET_KEY           : 'GET_KEY',
    CHECK_KEY         : 'CHECK_KEY',
    FETCH_LANGUAGES   : 'FETCH_LANGUAGES',
    FETCH_TREES       : 'FETCH_TREES',
    FETCH_TREE_BLOCKS : 'FETCH_TREE_BLOCKS',
    UPLOAD_AUDIO      : 'UPLOAD_AUDIO',
    FETCH_GROUPS      : 'FETCH_GROUPS',
    SAVE_CAMPAIGN     : 'SAVE_CAMPAIGN'
  };
  return function moveState(state) {
    term.clear();
    term(banner);
    term.bold('• Create new campaign\n');
    switch (state) {
        // --------------------------------------------------------------------
      case STATE.GET_NAME:
        term('\nCampaign name: ');
        term.inputField((error, input) => {
          if (!input) {
            menu(OPTION.HOME, 1);
          } else {
            campaign = input;
            db.all('SELECT * FROM campaigns WHERE name = ?;', campaign)
              .then(results => {
                if (results.length) {
                  term.white('\n✗ A campaign with this name already exists.\n');
                  term.singleColumnMenu([
                    'Change name', // 0
                    'Cancel'       // 1
                  ], { leftPadding: ' ' }, (error, response) => {
                    switch (response.selectedIndex) {
                      case 0:
                        moveState(STATE.GET_NAME);
                        break;
                      default:
                        menu(OPTION.HOME);
                    }
                  });
                } else {
                  moveState(STATE.GET_KEY);
                }
              });
          }
        });
        break;
        // --------------------------------------------------------------------
      case STATE.GET_KEY:
        term('\nViamo API key: ');
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
        term('\nChecking API key...');
        viamoFetch('ping')
          .then(() => { 
            moveState(STATE.FETCH_LANGUAGES); 
          })
          .catch(error => {
            if (error.response && 403 == error.response.statusCode) {
              term.white('\n✗ The key was not recognized by Viamo.\n');
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
              term.white('\n✗ Failed connecting to Viamo.\n');
              if ('EAI_AGAIN' === error.error.code) {
                term('Are you connected to the Internet?\n');
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
        term('\nFetching languages...');
        viamoFetch('languages')
          .then(response => {
            var languages = JSON.parse(response).data.languages;
            term.up(2);
            term.saveCursor();
            term('\n\nSelect campaign language:\n=========================\n');
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
        term('\nFetching Viamo trees...');
        viamoFetch('trees')
          .then(response => {
            var trees = JSON.parse(response).data.trees;
            term.up(2);
            term.saveCursor();
            term('\n\nSelect the campaign tree:\n=========================\n');
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
        term.bold(`\n\n${tree.title}: `);
        term(`${tree.description}`);
        term('\n\nFetching tree blocks...');
        viamoFetch(`trees/${tree.id}/blocks`)
          .then(response => {
            term.up(2);
            term('\n\nSelect the user question tree block:\
\n====================================\n');
            var blocks = JSON.parse(response).data.blocks;
            blocks = blocks && blocks.filter(
              block => 'Open-Ended Question' === block.type
            );
            if (!blocks || !blocks.length) {
              term.white(
                '\n✗ No open-ended questions were found in this tree.\n'
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
              term.singleColumnMenu(['↖ Go back'].concat(blocks.map(
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
        term('\n\nUploading Viamo audio...\n');
        var spinner;
        Promise.resolve()
          .then(() => {
            spinner = ora('1/3')
            spinner.spinner = spinners.arrow3;
            spinner.column = 2;
            spinner.start();
            return uploadViamoAudio('intro_audio.mp3', language)
          })
          .then(response => {
            spinner.text = '2/3';
            audio = response;
            return uploadViamoAudio('conclusion_audio.mp3', language)
          })
          .then(response => {
            spinner.text = '3/3';
            audio = `${audio}:${response}`;
            return uploadViamoAudio('satisfied_audio.mp3', language)
          })
          .then(response => {
            spinner.succeed();
            audio = `${audio}:${response}`;
            moveState(STATE.FETCH_GROUPS);
          });
        break;
        // --------------------------------------------------------------------
      case STATE.FETCH_GROUPS:
        term.restoreCursor();
        term.eraseDisplayBelow();
        term('\n\nFetching Zammad groups...');
        zammadRequest('groups', { json: true })
          .then(results => {
            term.up(2);
            term.eraseDisplayBelow();
            term.saveCursor();
            term('\n\nSelect group:\n=============\n');
            var groups = results.map(group => `${group.name}`);
            term.singleColumnMenu(groups, (error, response) => {
              group = groups[response.selectedIndex];
              moveState(STATE.SAVE_CAMPAIGN);
            });
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
            , language_name
            , viamo_api_key
            , viamo_tree_id
            , viamo_tree_block_id
            , viamo_audio
            , zammad_group
            , created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'));`;
        db.run(query, campaign, language.id, language.name, key, tree.id, block.id, audio, group)
          .then(res => {
            db.all('SELECT * FROM campaigns WHERE id = ?', res.lastID)
              .then(results => {
                selectedCampaign = results[0];
                term(`\n\n ✓ Campaign ${campaign} successfully saved.\n`);
                term.singleColumnMenu([
                  'Continue' // 0
                ], { leftPadding: ' ' }, 
                  (error, response) => { 
                    menu(OPTION.EDIT_CAMPAIGN); 
                  }
                );
              });
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
    term(`• ${selectedCampaign.name}\n`);
    term.bold('• Create new agent\n');
    switch (state) {
        // --------------------------------------------------------------------
      case STATE.GET_EMAIL:
        term('\nEmail address: ');
        term.inputField((error, input) => {
          if (!input) {
            menu(OPTION.EDIT_CAMPAIGN, 4);
          } else {
            email = input;
            db.all('SELECT * FROM agents WHERE campaign_id = ? AND email = ?;', 
              selectedCampaign.id, email).then(results => {
                if (results.length) {
                  term.up(2);
                  term.eraseDisplayBelow();
                  term.white('\n\n✗ This user already exists.\n');
                  term.singleColumnMenu([
                    'Ok' // 0
                  ], { leftPadding: ' ' }, 
                    (error, response) => { 
                      menu(OPTION.EDIT_CAMPAIGN, 4);
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
        term('\nLooking up email address in Auth0...');
        auth0.getUsersByEmail(email)
          .then(results => {
            if (results.length) {
              term.white(`\nThe email address ${email} already exists in Auth0. \
Select a user account to import from the list below. \n`);
              var users = results.map(user => `${user.username}\t${user.user_id}`);
              term.singleColumnMenu(['Cancel'].concat(users),
                (error, response) => {
                  switch (response.selectedIndex) {
                    case 0:
                      menu(OPTION.EDIT_CAMPAIGN, 4);
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
              'Re-enter email', // 0
              'Cancel'          // 1
            ], { leftPadding: ' ' }, (error, response) => {
              switch (response.selectedIndex) {
                case 0:
                  moveState(STATE.GET_EMAIL);
                  break;
                default:
                  menu(OPTION.EDIT_CAMPAIGN, 4);
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
          term('\nFirst name: ');
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
        term('\nLast name: ');
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
          term('\nUsername: ');
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
                  menu(OPTION.EDIT_CAMPAIGN, 4);
              }
            });
          });
        }
        break;
        // --------------------------------------------------------------------
      case STATE.GET_FIREBASE_TOKEN:
        term('\nFirebase token: ');
        term.inputField((error, input) => {
          firebase = { token: input };
          moveState(STATE.GET_SIP_USERNAME);
        });
        break;
        // --------------------------------------------------------------------
      case STATE.GET_SIP_USERNAME:
        term('\nSIP username: ');
        term.inputField((error, input) => {
          sip = { user: input };
          moveState(STATE.GET_SIP_PASSWORD);
        });
        break;
        // --------------------------------------------------------------------
      case STATE.GET_SIP_PASSWORD:
        term('\nSIP password: ');
        term.inputField((error, input) => {
          sip.pass = input;
          moveState(STATE.GET_SIP_HOST);
        });
        break;
        // --------------------------------------------------------------------
      case STATE.GET_SIP_HOST:
        term('\nSIP host (default: wazo.uliza.fm:50602): ');
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
        term('\nCreating Zammad user...');
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
        term('\nUpdating Auth0 user metadata...');
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
                      menu(OPTION.EDIT_CAMPAIGN, 4);
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
            term(`\n✓ Agent ${username} successfully saved.\n\n`);
            term(`Auth0 ID : ${auth0user.user_id}\n`);
            term(`Email    : ${email}\n`);
            term(`Username : ${username}\n`);
            if (userpw) {
              term(`Password : ${userpw}\n`);
            }
            term.singleColumnMenu([
              'Continue' // 0
            ], { leftPadding: ' ' }, 
              (error, response) => { menu(OPTION.EDIT_CAMPAIGN, 4); }
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
      term.bold('• Manage campaigns\n');
      db.all('SELECT * FROM campaigns;').then(results => {
        if (!results.length) {
          term('\nNo campaigns found.\n');
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
      term.bold(`• ${selectedCampaign.name}\n\n`);
      term(`ID            : ${selectedCampaign.id}\n`);
      term(`Viamo tree    : https://go.votomobile.org/trees/${selectedCampaign.viamo_tree_id}\n`);
      term(`Tree block ID : ${selectedCampaign.viamo_tree_block_id}\n`);
      term(`Language      : ${selectedCampaign.language_id} ${selectedCampaign.language_name}\n`);
      term(`Zammad group  : ${selectedCampaign.zammad_group}\n`);
      term.singleColumnMenu([
        '↖ Back',          // 0
        'Delete campaign', // 1
        'Modify campaign', // 2
        'Manage agents',   // 3
        'Create new agent' // 4
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
            menu(OPTION.MODIFY_CAMPAIGN);
            break;
          case 3:
            menu(OPTION.MANAGE_AGENTS);
            break;
          case 4:
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
      term.bold('• Delete campaign\n');
      term(`\n Delete the campaign ${selectedCampaign.name}? [Y|n] `);
      term.yesOrNo({
        yes: ['y', 'ENTER'],
        no: ['n']
      }, (error, result) => {
        if (result) {
          db.run('DELETE FROM agents WHERE campaign_id = ?;', selectedCampaign.id)
            .then(() => {
              db.run('DELETE FROM campaigns WHERE ID = ?;', selectedCampaign.id)
                .then(() => {
                  term(`\n\n ✓ The campaign has been deleted.\n`);
                  term.singleColumnMenu([
                    'Continue' // 0
                  ], { leftPadding: ' ' }, 
                    (error, response) => { menu(OPTION.SELECT_CAMPAIGN); }
                  );
                });
            })
        } else {
          menu(OPTION.EDIT_CAMPAIGN, 1);
        }
      });
      break;
      // ----------------------------------------------------------------------
    case OPTION.MODIFY_CAMPAIGN:
      term.clear();
      term(banner);
      term(`• ${selectedCampaign.name}\n`);
      term.bold('• Modify campaign\n');
      term.saveCursor();
      term.singleColumnMenu([
        '↖ Back',                         // 0
        'Change language',                // 1
        'Change campaign name',           // 2
        'Change tree and/or tree block',  // 3
        'Change Zammad group'             // 4
      ], {
        selectedIndex: selected
      }, (error, response) => {
        switch (response.selectedIndex) {
          case 0:
            menu(OPTION.EDIT_CAMPAIGN, 2);
            break;
          case 1:
            modifyCampaign(OPTION.CHANGE_LANGUAGE);
            break;
          case 2:
            modifyCampaign(OPTION.CHANGE_CAMPAIGN_NAME);
            break;
          case 3:
            modifyCampaign(OPTION.CHANGE_TREE);
            break;
          case 4:
            modifyCampaign(OPTION.CHANGE_GROUP);
            break;
        }
      });
      break;
      // ----------------------------------------------------------------------
    case OPTION.MANAGE_AGENTS:
      term.clear();
      term(banner);
      term(`• ${selectedCampaign.name}\n`);
      term.bold('• Manage agents\n');
      db.all('SELECT * FROM agents WHERE campaign_id = ?;', selectedCampaign.id)
        .then(results => {
          if (!results.length) {
            term('\nNo agents exist for this campaign.\n');
          }
          term.gridMenu(['↖ Back'].concat(results.map(item => `${item.id} ${item.email}`)), 
            (error, response) => {
            switch (response.selectedIndex) {
              case 0:
                menu(OPTION.EDIT_CAMPAIGN, 3);
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
      term(`• ${selectedCampaign.name}\n`);
      term.bold('• Edit agent\n');
      term(`\nemail    : ${selectedAgent.email}`);
      term(`\nAuth0 ID : ${selectedAgent.auth0_user_id}\n`);
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
      term(`• ${selectedCampaign.name}\n`);
      term.bold('• Delete agent\n');
      term(`\nDelete the agent ${selectedAgent.email}? [Y|n] `);
      term.yesOrNo({
        yes: ['y', 'ENTER'],
        no: ['n']
      }, (error, result) => {
        if (result) {
          db.run('DELETE FROM agents WHERE ID = ?;', selectedAgent.id)
            .then(() => {
              term(`\n\n✓ The agent has been deleted.\n`);
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

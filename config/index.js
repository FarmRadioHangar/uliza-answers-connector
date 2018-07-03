var ora     = require('ora');
var request = require('request-promise');
var term    = require('./terminal-kit-promise');

/*

 1. User enters API key.

    - Validate key
    - Print information

 2. User chooses language.
 3. User chooses tree.
 4. User chooses tree block used for open-ended question.
 5.

 */

term.$.grabInput();

term.$.on('key', key => {
  if (key === 'CTRL_C') {
    process.exit();
  }
});

let key, spinner, languages, language;

function viamoRequest(endpoint) {
  return request(`https://go.votomobile.org/api/v1/${endpoint}`, {
    headers: { 'api_key': key }
  });
}

return Promise.resolve()
  .then(() => term.$.clear())
  .then(() => term.term('Enter a Viamo API key to use for this campaign: '))
  .then(() => term.inputField())
  .then(input => {
    term.term('\n');
    spinner = ora('Verifying API key');
    spinner.start();
    key = input;
  })
  .then(() => viamoRequest('ping'))
  .catch(error => {
    spinner.stop();
    if (403 == error.response.statusCode) {
      term.$.brightRed('The key was not recognized by Viamo.\n');
    } else {
      term.$.brightRed('Failed connecting to Viamo.\n');
    }
    process.exit(1);
  })
  .then(response => {
    spinner.succeed('OK');
  })
  .then(() => viamoRequest('languages'))
  .then(response => {
    term.$.clear();
    term.term('Select language:\n================\n');
    languages = JSON.parse(response).data.languages;
    return term.singleColumnMenu(
      languages.map(lang => lang.name)
    );
  })
  .then(response => {
    language = languages[response.selectedIndex];
    return viamoRequest('trees');
  })
  .then(response => {
    term.$.clear();
    term.term('Select a tree:\n==============\n');
    trees = JSON.parse(response).data.trees;
    return term.singleColumnMenu(
      trees.map(tree => `${tree.id}\t${tree.title}`)
    );
  })
  .then(() => {
    process.exit();
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

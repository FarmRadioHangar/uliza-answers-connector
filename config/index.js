var fs      = require('fs');
var ora     = require('ora');
var request = require('request-promise');
var term    = require('./terminal-kit-promise');

term.$.grabInput();

term.$.on('key', key => {
  if (key === 'CTRL_C') {
    process.exit();
  }
});

let key, spinner, languages, language, trees, tree, blocks, block, config;

function viamoRequest(endpoint) {
  return request(`https://go.votomobile.org/api/v1/${endpoint}`, {
    headers: { 'api_key': key }
  });
}

return Promise.resolve()
  .then(() => term.$.clear())
  .then(() => term.drawImage('./logo.png', { shrink: { width: 40, height: 40 } }))
  .then(() => {
    term.$.bold('\nWelcome to the Uliza Answers configuration wizard.');
    term.$.wrap('\nThis will take you through the process of configuring Uliza Answers for your campaign. To complete this wizard, you need the following prerequisites:');
    term.term('\n\n- A Viamo API key. This can be obtained from https://go.votomobile.org/settings (under the \'API Key\' tab).\n');
    term.term('- A tree which includes the open-ended question block that asks the participant to contribute their question.\n');
    term.term('\nEnter the Viamo API key: ');
  })
  .then(() => term.inputField())
  .then(input => {
    term.$.clear();
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
  .then(() => {
    spinner.succeed('OK');
    return viamoRequest('languages');
  })
  .then(response => {
    term.term('\nSelect the language of this campaign:\n=====================================\n');
    term.term('\nYou can add new languages from https://go.votomobile.org/languages/new.\n');
    languages = JSON.parse(response).data.languages;
    return term.singleColumnMenu(
      languages.map(lang => lang.name)
    );
  })
  .then(response => {
    term.$.clear();
    language = languages[response.selectedIndex];
    spinner = ora();
    spinner.start();
    return viamoRequest('trees');
  })
  .then(response => {
    spinner.stop();
    term.$.clear();
    term.term('Select the campaign tree:\n=========================\n');
    trees = JSON.parse(response).data.trees;
    return term.singleColumnMenu(
      trees.map(tree => `${tree.id}\t${tree.title}`)
    );
  })
  .then(response => {
    term.$.clear();
    tree = trees[response.selectedIndex];
    spinner = ora();
    spinner.start();
    return viamoRequest(`trees/${tree.id}/blocks`);
  })
  .then(response => {
    spinner.stop();
    term.$.clear();
    term.term('Select the user question tree block:\n====================================\n');
    term.term('\nThis is the tree block that prompts the participant to ask their question to the system.\n');
    blocks = JSON.parse(response).data.blocks.filter(
      block => 'Open-Ended Question' === block.type
    );
    if (!blocks.length) {
      term.$.brightRed('\nNo open ended question blocks were found in this tree.\n');
      process.exit();
    }
    return term.singleColumnMenu(
      blocks.map(block => `${block.id} ${block.details.title}`)
    );
  })
  .then(response => {
    term.$.clear();
    block = blocks[response.selectedIndex];
  })
  .then(() => {
    config  = `VIAMO_API_KEY=${key}\n`;
    config += `VIAMO_TREE_ID=${tree.id}\n`;
    config += `VIAMO_BLOCK_ID=${block.id}\n`;
    config += `LANGUAGE_ID=${language.id}\n`;
    term.term(`${config}\n`);
    term.term('Write configuration to .env? [Y|n] ');
    return term.yesOrNo({
      yes: ['y', 'ENTER'],
      no: ['n']
    });
  })
  .then(result => {
    term.term('\n\n');
    if (result) {
      fs.writeFileSync('.env', config);
      term.term('✔ Configuration saved.\n');
    } else {
      term.$.brightRed('Configuration not saved.\n');
    }
  })
  .then(() => {
    process.exit();
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

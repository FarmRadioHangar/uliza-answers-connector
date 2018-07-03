var terminal = require('terminal-kit').terminal;

function inputField() {
  return new Promise((resolve, reject) => {
    terminal.inputField((error, input) => {
      return error ? reject(error) : resolve(input);
    });
  });
}

function singleColumnMenu(items) {
  return new Promise((resolve, reject) => {
    terminal.singleColumnMenu(items, (error, response) => {
      return error ? reject(error) : resolve(response);
    });
  });
}

function term(msg) {
  return Promise.resolve(terminal(msg));
}

module.exports = {
  inputField,
  singleColumnMenu,
  term,
  $: terminal
};

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

function yesOrNo(options) {
  return new Promise((resolve, reject) => {
    terminal.yesOrNo(options, (error, result) => {
      return error ? reject(error) : resolve(result);
    });
  });
}

function drawImage(url, options) {
  return new Promise((resolve, reject) => {
    terminal.drawImage(url, options, error => {
      return error ? reject(error) : resolve();
    });
  });
}

function term(msg) {
  return Promise.resolve(terminal(msg));
}

module.exports = {
  inputField,
  singleColumnMenu,
  yesOrNo,
  drawImage,
  term,
  $: terminal
};

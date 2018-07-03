var terminal = require('terminal-kit').terminal;

function inputField() {
  return new Promise((resolve, reject) => {
    terminal.inputField((error, input) => {
      return error ? reject(error) : resolve(input);
    });
  });
}

function singleColumnMenu(items, options) {
  return new Promise((resolve, reject) => {
    terminal.singleColumnMenu(items, options, (error, response) => {
      return error ? reject(error) : resolve(response);
    });
  });
}

function singleLineMenu(items, options) {
  return new Promise((resolve, reject) => {
    terminal.singleLineMenu(items, options, (error, response) => {
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

function clear() {
  return Promise.resolve(terminal.clear());
}

function term(msg) {
  return Promise.resolve(terminal(msg));
}

module.exports = {
  inputField,
  singleColumnMenu,
  singleLineMenu,
  yesOrNo,
  drawImage,
  clear,
  term,
  $: terminal
};

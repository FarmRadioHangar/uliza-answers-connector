
function once() {
  return Promise.resolve()
  .then(() => {
    console.log('once');
  })
  .then(() => {
    poll();
  });
}

function poll() {
  setTimeout(() => {
    once().catch((error) => { console.error(error); });
  }, 4000);
}

module.exports = {

  work: function() {
    once();
  }

};

function poll() {
  return Promise.resolve()
  .then(() => {
    process.stdout.write('.');
  })
  .then(() => {
    setTimeout(() => {
      poll().catch((error) => { console.error(error); });
    }, 4000);
  });
}

module.exports = {

  work: function() {
    poll();
  }

};

window.addEventListener('load', function() {

  function log(message) {
    var out = 'string' === typeof(message) 
      ? message : JSON.stringify(message, null, 4);
    document.querySelector('#output').innerHTML += out + '\n';
  }

  function namespaced(name) {
    return 'farmradio_' + name;
  }

  function setSession(authResult) {
    log(authResult);
    // Set access token expiry time 
    var expiresAt = JSON.stringify(
      authResult.expiresIn * 1000 + new Date().getTime()
    );
    localStorage.setItem(namespaced('access_token'), authResult.accessToken);
    localStorage.setItem(namespaced('id_token'), authResult.idToken);
    localStorage.setItem(namespaced('expires_at'), expiresAt);
    location.hash = '';
  }

  function logout() {
    // Remove tokens and expiry time from localStorage
    localStorage.removeItem(namespaced('access_token'));
    localStorage.removeItem(namespaced('id_token'));
    localStorage.removeItem(namespaced('expires_at'));
    log('Logged out!');
  }

  function isAuthenticated() {
    // Check whether the current time is past the access token's expiry time
    var expiresAt = JSON.parse(localStorage.getItem(namespaced('expires_at')));
    return new Date().getTime() < expiresAt;
  }

  var webAuth = new auth0.WebAuth({
    domain: AUTH0_DOMAIN,
    clientID: AUTH0_CLIENT_ID,
    redirectUri: AUTH0_CALLBACK_URL,
    audience: 'https://dev.farmradio.fm/api/',
    responseType: 'token id_token',
    scope: 'openid profile',
    leeway: 40
  });

  webAuth.parseHash(function(err, authResult) {
    if (authResult && authResult.accessToken && authResult.idToken) {
      setSession(authResult);
    } else if (err) {
      log(err);
      alert(
        'Error: ' + err.error + '. Check the log for further details.'
      );
    }
  });

  document.getElementById('btn-login').addEventListener('click', function() {
    webAuth.authorize();
  });

  document.querySelector('#btn-logout').addEventListener('click', function() {
    if (!isAuthenticated()) {
      return alert('You are not logged in!');
    }
    logout();
  });

  document.querySelector('#btn-clear').addEventListener('click', function() {
    document.querySelector('#output').innerHTML = '';
  });

  document.querySelector('#btn-get-user').addEventListener('click', function() {
    var token = localStorage.getItem(namespaced('access_token'));
    var url = window.location.origin + '/users/me';
    log('GET ' + url);
    fetch(url, { // connector.uliza.fm/users/me
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function(response) {
      if (401 == response.status) {
        return {
          error: 'The server returned: 401 Unauthorized'
        };
      }
      return response.json();
    })
    .then(function(json) {
      log(json);
    })
    .catch(function(error) {
      log('Could not connect to server.');
    });
  });

});

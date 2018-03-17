window.addEventListener('load', function() {

  function namespaced(name) {
    return 'farmradio_' + name;
  }

  function setSession(authResult) {
    console.log(authResult);
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
    document.querySelector('#output').innerHTML = 'Logged out!';
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
      console.error(err);
      alert(
        'Error: ' + err.error + '. Check the console for further details.'
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

  document.querySelector('#btn-get-user').addEventListener('click', function() {
    var token = localStorage.getItem(namespaced('access_token'));
    //fetch('http://connector.uliza.fm/users/me')
    fetch('http://localhost:8099/users/me', {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    })
    .then(function(response) {
      if (401 == response.status) {
        return {
          error: 'The server returned a 401 Unauthorized response.'
        };
      }
      return response.json();
    })
    .then(function(json) {
      document.querySelector('#output').innerHTML = JSON.stringify(json);
    });
  });

});

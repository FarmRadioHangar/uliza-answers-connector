# uliza-answers-connector

### :snowman: Snow test :snowflake:

```
git clone https://github.com/FarmRadioHangar/uliza-answers-connector
cd uliza-answers-connector
./setup.sh
```

This script will ask you for the API keys and write them to the `.env` file. Answer `y` to install the Node dependencies.

Next, run `npm start` (or `yarn start`) to start the server.

Start Ngrok with, e.g., `ngrok http 8099`.

Schedule the "Snow" test tree call using 

```
./snow.sh
```

The script will ask you for your phone number and a webhook URL. Specify the Ngrok URL without a trailing slash; e.g., `http://xxxxxxxx.ngrok.io`.

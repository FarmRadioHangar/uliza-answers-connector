# uliza-answers-connector

### :snowman: Snow test :snowflake:

```
git clone https://github.com/FarmRadioHangar/uliza-answers-connector
cd uliza-answers-connector
./setup.sh
```

This script will ask you for the API keys and write them to the `.env` file. Answer <kbd>y</kbd> to install the Node dependencies.

Next, run `npm start` (or `yarn start`) to launch the server.

Start Ngrok with, e.g., `./ngrok http 8099` (from the directory where your Ngrok binary is located).

Schedule the "Snow" test tree call using: 

```
./snow.sh
```

The script will ask you for your phone number and a webhook URL. Specify the Ngrok URL without a trailing slash; i.e., in the form `http://xxxxxxxx.ngrok.io`, where xxxxxxxx is the subdomain assigned to your tunnel.

When you receive the call, answer the poll question and then choose to provide a question (option #2). Watch the output from the server process and make a note of any errors or warnings. On completion, you should see a link pointing to the newly created Zammad ticket.

Open the ticket in the browser and add an answer. Within a few seconds the server should output a log message with the new article:

```
[zammad_ticket_update_id] YOUR_TICKET_ID
[zammad_ticket_article(s)_added] [ ARTICLE_INFO ]
```

### `users/me` endpoint

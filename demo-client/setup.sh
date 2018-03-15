#!/bin/bash
read -p 'Enter your Auth0 Client ID: ' AUTH0_CLIENT_ID
read -p 'Enter your Auth0 Client Secret: ' AUTH0_CLIENT_SECRET
read -p 'Enter the Uliza Answers Connector URL (or leave blank for "http://localhost:8099"): ' ULIZA_ANSWERS_CONNECTOR_URL
ULIZA_ANSWERS_CONNECTOR_URL=${ULIZA_ANSWERS_CONNECTOR_URL:-'http://localhost:8099'}
printf "AUTH0_DOMAIN=farmradio.eu.auth0.com\nAUTH0_CLIENT_ID=$AUTH0_CLIENT_ID\nAUTH0_CLIENT_SECRET=$AUTH0_CLIENT_SECRET\nULIZA_ANSWERS_CONNECTOR_URL=$ULIZA_ANSWERS_CONNECTOR_URL" > .env
read -r -p "Run npm install? [y/N] " response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])+$ ]] 
then 
    npm install 
fi

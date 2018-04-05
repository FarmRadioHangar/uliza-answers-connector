#!/bin/bash
read -p 'Enter your Viamo API key: ' VIAMO_API_KEY
read -p 'Enter the Zammad API token: ' ZAMMAD_API_TOKEN
read -p 'Enter Uliza Answers Connector Auth0 client ID: ' AUTH0_CLIENT_ID
read -p 'Enter Uliza Answers Connector Auth0 client secret: ' AUTH0_CLIENT_SECRET
printf "ZAMMAD_API_TOKEN=$ZAMMAD_API_TOKEN\nVIAMO_API_KEY=$VIAMO_API_KEY\nAUTH0_CLIENT_ID=$AUTH0_CLIENT_ID\nAUTH0_CLIENT_SECRET=$AUTH0_CLIENT_SECRET" > .env
read -r -p "Run npm install? [y/N] " response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])+$ ]] 
then 
    npm install 
fi

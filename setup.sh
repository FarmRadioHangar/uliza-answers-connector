#!/bin/bash
read -p 'Enter your Viamo API key: ' VIAMO_API_KEY
read -p 'Enter the Zammad API token: ' ZAMMAD_API_TOKEN
printf "ZAMMAD_API_TOKEN=$ZAMMAD_API_TOKEN\nVIAMO_API_KEY=$VIAMO_API_KEY\n" > .env
read -r -p "Run npm install? [y/N] " response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])+$ ]] 
then 
    npm install 
fi

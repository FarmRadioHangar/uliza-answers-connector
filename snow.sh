#!/bin/bash
read -p 'Phone number to call: ' PHONE_NUMBER && \
read -p 'Webkhook URL (e.g., "http://xxxxxxx.ngrok.io"): ' WEBHOOK_URL && \
eval $(cat .env | sed 's/^/export /')
PAYLOAD="{\"send_to_phones\":\"$PHONE_NUMBER\",\"tree_id\":\"22881\",\"api_key\":\"$VIAMO_API_KEY\",\"webhook_url\":\"$WEBHOOK_URL/update?audio_block_id=9761370\",\"webhook_method\":\"POST\"}"
curl \
  -XPOST \
  https://go.votomobile.org/api/v1/outgoing_calls/ \
  -H 'Content-Type: application/json' \
  -d $PAYLOAD

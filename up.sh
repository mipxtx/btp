#!/bin/bash
mkdir click_data
mkdir logs
mkdir logs/php
mkdir logs/nginx
chmod +x clichouse/init.sh
docker build --tag btp:php btp-php
docker build --tag btp:listner listner
docker-compose up -d
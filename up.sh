#!/bin/bash
mkdir click_data
mkdir logs
mkdir logs/php
mkdir logs/nginx
docker build --tag btp:php btp-php
docker build --tag btp:mock listner
docker-compose up
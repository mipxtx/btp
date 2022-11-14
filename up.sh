#!/bin/bash
mkdir click_data
mkdir logs
mkdir logs/php
mkdir logs/nginx
docker build --tag btp:listner listner
docker-compose up
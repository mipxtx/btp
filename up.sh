#!/bin/bash
docker build --tag btp:php btp-php
docker build --tag btp:mock listner
docker-compose up
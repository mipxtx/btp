#!/bin/bash
set -e

clickhouse client -n <<-EOSQL
create database IF NOT EXISTS btp;

create table IF NOT EXISTS btp.timer
(
    date      DateTime,
    type      String,
    service   String,
    server    String,
    operation String,
    time      Int32
)
    engine = MergeTree PARTITION BY toYYYYMM(date)
        ORDER BY date
        SETTINGS index_granularity = 8192;



EOSQL

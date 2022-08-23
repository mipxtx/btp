#!/bin/bash
set -e

clickhouse client -n <<-EOSQL
	CREATE DATABASE btp;
	create table btp.branch
  (
      name   String,
      branch String
  )
      engine = AggregatingMergeTree ORDER BY (name, branch)
          SETTINGS index_granularity = 8192;
  create table btp.leaf
  (
      name String,
      leaf String
  )
      engine = AggregatingMergeTree ORDER BY (name, leaf)
          SETTINGS index_granularity = 8192;

create table if not exists btp.names
(
    prefix String,
    suffix String,
    name   String
)
    engine = AggregatingMergeTree ORDER BY (prefix, suffix, name)
        SETTINGS index_granularity = 8192;

create table btp.timer
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

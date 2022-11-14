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

create table IF NOT EXISTS btp.name_tree
(
    name String,
    prefix String,
    ntype String
)
    ENGINE = AggregatingMergeTree()
    order by (ntype,prefix,name);

create table IF NOT EXISTS btp.names
(
    name    String,
    prefix  String,
    suffix  String,
    orderby Int64,
    time Int64,
    scale   Int16
)
    ENGINE = AggregatingMergeTree()
        order by (scale,prefix,suffix,name);

create table IF NOT EXISTS btp.counters_5
(
    name  String,
    time  Int64,
    avg   Int64,
    count Int64,
    p50   Int64,
    p80   Int64,
    p95   Int64,
    p99   Int64,
    p100  Int64,
    min   Int64,
    max   Int64
)
    ENGINE = AggregatingMergeTree()
        order by (time,name)
        partition by toYYYYMM(toDate32(time));

create table IF NOT EXISTS btp.counters_60
(
    name  String,
    time  Int64,
    avg   Int64,
    count Int64,
    p50   Int64,
    p80   Int64,
    p95   Int64,
    p99   Int64,
    p100  Int64,
    min   Int64,
    max   Int64
)
    ENGINE = AggregatingMergeTree()
        order by (time,name)
        partition by toYYYYMM(toDate32(time));

create table IF NOT EXISTS btp.counters_420
(
    name  String,
    time  Int64,
    avg   Int64,
    count Int64,
    p50   Int64,
    p80   Int64,
    p95   Int64,
    p99   Int64,
    p100  Int64,
    min   Int64,
    max   Int64
)
    ENGINE = AggregatingMergeTree()
        order by (time,name)
        partition by toYYYYMM(toDate32(time));

create table IF NOT EXISTS btp.counters_3600
(
    name  String,
    time  Int64,
    avg   Int64,
    count Int64,
    p50   Int64,
    p80   Int64,
    p95   Int64,
    p99   Int64,
    p100  Int64,
    min   Int64,
    max   Int64
)
    ENGINE = AggregatingMergeTree()
        order by (time,name)
        partition by toYYYYMM(toDate32(time));

EOSQL

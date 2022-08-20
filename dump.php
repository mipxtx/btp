<?php

$h = fsockopen("127.0.0.1", "12345");

fwrite($h, '{"jsonrpc":"2.0","method":"get_name_tree","id":1,"params":{"prefix":"service","depth":1,"sep":"~~","ntype":"branch","offset":0,"limit":100000,"sortby":"","power":false}}' . "\n");

echo fgets($h);
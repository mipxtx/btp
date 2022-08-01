<?php

$h = fsockopen("127.0.0.1", "12345");

fwrite($h, '{"jsonrpc":"2.0", "method":"dump", "id": 1}' . "\n");

echo fgets($h);
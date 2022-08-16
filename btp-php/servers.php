<?php
/**
 * Created by PhpStorm.
 * User: mix
 * Date: 14.03.17
 * Time: 16:30
 */

$host= 'listner';

return [
    'production' => [
        '5' => [['host' => $host, 'port' => 12345]],
        '60' => [['host' => $host, 'port' => 12345]],
        '420' => [['host' => $host, 'port' => 12345]],
        '3600' => [['host' => $host, 'port' => 12345]],
        '86400' => [['host' => $host, 'port' => 12345]],
    ],
];


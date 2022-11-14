<?php
/**
 * Created by PhpStorm.
 * User: mix
 * Date: 14.03.17
 * Time: 16:30
 */

$host= 'btpd';

return [
    'production' => [
        '5' => [['host' => $host, 'port' => 37000]],
        '60' => [['host' => $host, 'port' => 37001]],
        '420' => [['host' => $host, 'port' => 37004]],
        '3600' => [['host' => $host, 'port' => 37002]],
        '86400' => [['host' => $host, 'port' => 37003]],
    ],
];


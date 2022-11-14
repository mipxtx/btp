<?php
/**
 * Created by PhpStorm.
 * User: mix
 * Date: 19.03.2018
 * Time: 19:23
 */

require __DIR__ . "/../init.php";

$btp = JsonRpc_BtpService::createByCluster('production', 86400);

$data = [
    'prefix' => 'service~~app_call',
    'depth' => 1,
    'sep' => '~~',
    'ntype' => 'branch',
    'offset' => 0,
    'limit' => 100000,
    'sortby' => 'count',
    'power' => false,
];

$result = $btp->request('get_name_tree', $data)['branches'];


$counters = ['send' => 'service~~app_notify~~:appId:~~sendMessage', 'click' => 'service~~app_call~~:appId:~~navigate.notify'];

header("Content-type: text/cvs");
header('Content-Disposition: attachment; filename="app_stat.csv"');
//service~~app_call~~{$appId}~~navigate.notify
foreach($counters as $caption => $pattern) {
    $aps = [];
    $notify = [];
    echo $caption . "\n";

    foreach ($result as $appId) {

        $name = str_replace(':appId:', $appId, $pattern);

        $data = array(
            'name' => $name,
            'sep' => '~~',
            'ts' => 0,
            'offset' => 0,
            'limit' => 3000,
        );
        $res = $btp->request('get', $data);
        if ($res['counters']) {
            foreach ($res['counters'] as $counter) {
                list($time, $_, $cnt) = $counter;

                $time /= 1000000;
                if (date('Y', $time) < 2018) {
                    continue;
                }

                $date = date('Y-m-d', $time);
                $notify[$date][$appId] = $cnt;
                $aps[$appId] = 1;
            }
        }
    }

    ksort($notify);

    $aps = array_keys($aps);

    foreach ($aps as $id) {
        echo ";" . $id;
    }
    echo "\n";

    foreach ($notify as $day => $data) {
        echo $day . ";";
        foreach ($aps as $appId) {
            if (isset($notify[$day][$appId])) {
                echo $notify[$day][$appId];
            } else {
                echo 0;
            }
            echo ";";
        }
        echo "\n";
    }
}



//print_r($notify);

//print_r($res);
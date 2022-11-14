<?php
/**
 * Created by PhpStorm.
 * User: mix
 * Date: 14.03.17
 * Time: 10:51
 */

require __DIR__ . "/init.php";

$btp = JsonRpc_BtpService::createByCluster('production', 60);

$service = 'rabbitmq_publish';

$rr = [
    'prefix' => "service~~$service",
    'depth' => 1,
    'sep' => '~~',
    'ntype' => 'leaf',
    'offset' => 0,
    'limit' => 100000,
    'sortby' => 'count',
];

$out = $btp->get_name_tree($rr)['branches'];

foreach ($out as $op) {
    if (preg_match('/www[0-9]{1,2}/', $op)) {

        echo $op . "\n";

        $rr = [
            "prefix" => "script~~",
            "suffix" => "~~$service~~$op",
            "sep" => "~~",
            "offset" => 0,
            "limit" => 10,
            "sortby" => "count"
        ];

        foreach($btp->get_names($rr)['names_ts'] as $scriptDesc){
            $script = $scriptDesc['name'];
            echo $script . "\n";
            $btp->del($script);
        }

        $branch = "service~~$service~~$op";
        echo $branch . "\n";
        $btp->del($branch);
        //die();


        continue;

        echo "branch: $branch\n";
        $rr = [
            'prefix' => $branch,
            'depth' => 1,
            'sep' => '~~',
            'ntype' => 'leaf',
            'offset' => 0,
            'limit' => 100000,
            'sortby' => 'count',
        ];

        foreach ($btp->get_name_tree($rr)['branches'] as $lf) {
            $leaf = "$branch~~$lf";
            echo "del $leaf\n";
            $btp->del(['name' => $leaf]);
        }
        $btp->del(['name' => $br]);
    } else {
    }
}











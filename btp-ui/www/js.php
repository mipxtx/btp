<?php

require __DIR__ . "/../init.php";

set_time_limit(60);
ini_set('memory_limit', '1G');
$method = $_REQUEST['method'];
$params = json_decode($_REQUEST['params'], 1);
$cluster = $_REQUEST['cluster'];
$scale = $_REQUEST['scale'];
$params['scale'] = $scale;

$btp = JsonRpc_BtpService::createByCluster($cluster, $scale);
$data = json_encode($btp->request($method, $params));

//ob_start("ob_gzhandler");
//ini_set('zlib.output_compression',true);
//ini_set('zlib.output_compression_level',5);

header("Expires: Mon, 26 Jul 1997 05:00:00 GMT");
header("Last-Modified: " . gmdate("D, d M Y H:i:s") . " GMT");
header("Cache-Control: no-store, no-cache, must-revalidate");
header("Cache-Control: post-check=0, pre-check=0", false);
header("Pragma: no-cache");

header('Content-Type: text/x-json; charset=utf-8');
header('Content-Length: ' . strlen($data));
echo $data;
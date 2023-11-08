<?php
/*
//$result = btp_config_server_set(1, '10.5.1.25', 22400);
$result = btp_config_server_set(1, '10.5.1.100', 35000);
echo "Line:".__LINE__." Expected true: got ".var_export($result, 1)."\n";

$result = btp_config_server_set(1, str_repeat('10.5.1.25', 40), 22400);
echo "Line:".__LINE__." Expected false: got ".var_export($result, 1)."\n";

$result = btp_config_server_set(5, 'cdaemon24dfr', 22400);
echo "Line:".__LINE__." Expected false: got ".var_export($result, 1)."\n";

btp_config_server_set(2, '10.5.1.26', 22400);
btp_config_server_set(3, '10.5.1.27', 22400);
btp_config_server_set(2, 'cdaemon24', 22400);
btp_config_server_set(4, '10.5.1.28', 700000);

btp_config_server_set(32, '10.5.1.28', 700000);
btp_config_server_set(33, '10.5.1.28', 700000);

$result = btp_timer_start( 'service', 'server', 'operation', 0);
echo "Line:".__LINE__." Expected false: got ".var_export($result, 1)."\n";

btp_script_name_set(__FILE__);
$resources = [];

/*echo "btp.cli_enable = ".ini_get('btp.cli_enable')."\n";
ini_set('btp.cli_enable', 0);
echo "btp.cli_enable = ".ini_get('btp.cli_enable')."\n";
ini_set('btp.cli_enable', 1);
echo "btp.cli_enable = ".ini_get('btp.cli_enable')."\n";

echo "btp.fpm_enable = ".ini_get('btp.fpm_enable')."\n";
ini_set('btp.fpm_enable', 0);
echo "btp.fpm_enable = ".ini_get('btp.fpm_enable')."\n";
ini_set('btp.fpm_enable', 1);
echo "btp.fpm_enable = ".ini_get('btp.fpm_enable')."\n";// *//*

//ini_set('btp.autoflush_count', 1);
//echo "btp.autoflush_count = ".ini_get('btp.autoflush_count')."\n";

for( $i = 1; $i < 10; $i++) {
    $resources[$i] = btp_timer_start( 'test_service', 'server'.($i % 3), 'operation'.($i % 2), 1);
	var_dump($resources[$i]);
}

btp_timer_count( 'test_service', 'server'.($i % 3), 'count'.($i % 2), 34000000005, [1]);
btp_timer_count_script( 'test_service', 'server3', 'counter', 'other_script', 35651805228000000, 1);

$result = btp_timer_stop( $resources[1] );
echo "Line:".__LINE__." Expected true: got ".var_export($result, 1)."\n";

$result = btp_timer_stop( $resources[1] );
echo "Line:".__LINE__." Expected false: got ".var_export($result, 1)."\n";

$result = btp_timer_stop( $resources[9] );
$result = btp_timer_stop( $resources[8] );

var_dump($resources);

$resource8 = $resources[8];
unset($resources);

var_export( btp_dump() );

var_export( btp_flush() );

var_dump($resource8);
var_dump(btp_timer_stop( $resource8 ));

var_export( btp_dump() );
var_export( btp_dump_timer($resource8) );
// */
######################################################################################################
//*
ini_set('btp.autoflush_count', 1000);
ini_set('btp.autoflush_time', 600);
/*
$rndkeys = [];
for ($i = 10; $i; $i--) {
	$s = '';
	for ($j = 100; $j; $j--) {
		$s .= sha1(uniqid(mt_srand(), true));
	}
	$rndkeys[] = substr($s, 0, mt_rand(16, 400));
} // */

$poolid = 1;
$tp1 = [
	['host' => '192.168.2.13', 'port' => 38000],
];
$tp2 = [
	['host' => '192.168.2.13', 'port' => 38000],
];
btp_config_server_pool($poolid, $tp1, $tp2);
//var_export( btp_dump() );
btp_script_name_set(__FILE__, [$poolid]);
for ($i = 1010; $i; $i--) {
	#$svc = $rndkeys[array_rand($rndkeys)];
	$timer1 = btp_timer_start('focuspocus', 'sharded', 'btp', [$poolid]);
	#$timer1 = btp_timer_start($svc, 'sharded', 'btp', [$poolid]);
	for ($j=10; $j; $j--);
	btp_timer_stop($timer1);
}
echo microtime(true),"\n";
//var_dump($timer1);
//var_export(btp_dump_timer($timer1));
btp_flush(true);
//var_export(btp_dump_timer($timer1));
//btp_timer_stop($timer1);
//var_export(btp_dump_timer($timer1));

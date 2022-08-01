<?php
btp_config_server_set(0,"127.0.0.1", "12345");

register_shutdown_function(function(){
    usleep(100);
});

btp_script_name_set($_SERVER['SCRIPT_NAME'],0);
$t = btp_timer_start("svs","srv","op",0);
usleep(100);
btp_timer_stop($t);

$t = btp_timer_start("svs","srv","op",0);
usleep(100);
btp_timer_stop($t);




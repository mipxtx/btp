<?php
btp_config_server_set(0, "127.0.0.1", 38001, BTP_FORMAT_V3);
btp_script_name_set("NewScript" .mt_rand(0,4), "test", 0);
btp_timer_count("NewService", "new_server", "new_op", 123, 0);


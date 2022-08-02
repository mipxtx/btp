#!/bin/bash
#cd /btp-ui && git pull origin master && git log -1 && cp /btp-ui/config/servers.sample.php /btp-ui/config/servers.php
exec php-fpm7.4 -F -R

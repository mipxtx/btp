#!/bin/bash
pwd
exec /btpd/build/bin/btpd -C /btpd/examples/simple/btp.conf
echo $?
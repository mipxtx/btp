<?php
namespace Btp;
class BtpNullService implements BtpServiceInterface
{

    public function setName($name = null)
    {

    }

    public function createTimer($service, $server, $operation): BtpTimerInterface
    {
        // TODO: Implement createTimer() method.
    }

    public function count($service, $server, $operation, $ts = 1)
    {
        // TODO: Implement count() method.
    }
}
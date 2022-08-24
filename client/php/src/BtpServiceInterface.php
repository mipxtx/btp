<?php
namespace Btp;
interface BtpServiceInterface
{
    public function setName($name = null);

    public function createTimer($service, $server, $operation) : BtpTimerInterface;

    public function count($service, $server, $operation, $ts = 1);

}
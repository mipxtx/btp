<?php
namespace Btp;
class BtpTimer implements BtpTimerInterface
{

    private $stoped = false;

    private $res;

    /**
     * @param $service
     * @param $server
     * @param $operation
     */
    public function __construct($service, $server, $operation, $num)
    {

        if (function_exists("btp_timer_start")) {
            $this->res = btp_timer_start($service, $server, $operation, $num);
        }

    }

    public function stop($operationReplace = null)
    {
        if ($this->stoped) {
            throw new \LogicException('timer already stoped');
        }
        if (function_exists("btp_timer_stop")) {
            if ($operationReplace) {
                //$this->operation = $operationReplace;
            }
            $this->res = btp_timer_stop($this->res);
        }


    }
}
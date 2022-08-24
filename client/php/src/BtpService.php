<?php
namespace Btp;
class BtpService implements BtpServiceInterface
{
    private static $counter = 0;

    private $number;

    public function __construct($host, $port, $scriptName = null)
    {
        $this->number = self::$counter;
        btp_config_server_set($this->number, $host, $port);
        self::$counter++;

        $this->setName($scriptName);
    }

    /**
     * @param $name
     * @return void
     */
    public function setName($name = null)
    {
        if (!$name) {
            $name = $_SERVER['SCRIPT_NAME'];
        }
        btp_script_name_set($name, $this->number);

    }

    /**
     * @param $service
     * @param $server
     * @param $operation
     * @return BTPTimer
     */
    public function createTimer($service, $server, $operation) : BtpTimerInterface
    {
        return new BTPTimer($service, $server, $operation, $this->number);
    }

    /**
     * @param $service
     * @param $server
     * @param $operation
     * @param $ts
     * @return void
     */
    public function count($service, $server, $operation, $ts = 1)
    {

        btp_timer_count($service, $server, $operation, $ts, $this->number);

    }
}

<?php
namespace Btp;
class Btp
{
    private static $instance;

    /**
     * @return BtpServiceInterface
     */
    public static function getService(): BtpServiceInterface
    {
        if (!self::$instance) {
            if (extension_loaded('btp')) {
                self::$instance = new BtpService(getenv('BTP_HOST'), getenv('BTP_PORT'));
            } else {
                self::$instance = new BtpNullService();
            }
        }
        return self::$instance;
    }

    /**
     * @param $service
     * @param $server
     * @param $operation
     * @return BTPTimer
     */
    public static function createTimer($service, $server, $operation): BtpTimerInterface
    {
        return self::getService()->createTimer($service, $server, $operation);
    }

    public static function createMysqlTimer($sql, $host = 'mysql'): BtpTimerInterface
    {
        preg_match('/([^\s]+)\s/', $sql, $out);
        $type = strtolower($out[1]);

        switch ($type) {
            case 'select':
            case 'update':
                break;
            default:
                //echo $type . ":" . $sql . "\n";
        }
        return self::createTimer('mysql', $host, $type);
    }

    /**
     * @param $service
     * @param $server
     * @param $operation
     * @param $ts
     * @return void
     */
    public static function count($service, $server, $operation, $ts = 1)
    {
        self::getService()->count($service, $server, $operation, $ts);
    }
}
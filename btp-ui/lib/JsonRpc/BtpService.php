<?php

/**
 * Created by PhpStorm.
 * User: mix
 * Date: 14.03.17
 * Time: 16:59
 */
class JsonRpc_BtpService
{
    /**
     * @var JsonRpc_Connection[]
     */
    private $connects = [];

    public static function createByCluster($cluster, $scale) {
        $out = new self;
        $config = require ROOT . "/config/servers.php";
        foreach ($config[$cluster][$scale] as $serverParams) {
            $out->addServer(new JsonRpc_Connection($serverParams));
        }

        return $out;
    }

    public function addServer(JsonRpc_Connection $connect) {
        $this->connects[] = $connect;
    }

    public function request($method, array $params) {
        return $this->$method($params);
    }

    private function mergeCounters($counters) {
        $out = [];
        foreach ($counters as $time => $point) {
            if (count($point) == 1) {
                $out[] = $point[0];
            } else {
                $total = 0;
                foreach ($point as $set) {
                    $total += $set[2];
                }
                $merged = [];
                foreach ($point as $set) {
                    $merged[0] = $time;
                    foreach ([1, 2, 3, 4, 5, 6, 7] as $key) {
                        if (!isset($merged[$key])) {
                            $merged[$key] = 0;
                        }
                        if ($key == 2) {
                            $merged[$key] += $set[$key];
                        } else {
                            $merged[$key] += ($set[$key] * $set[2] / $total);
                        }
                    }
                }
                foreach ([1, 3, 4, 5, 6, 7] as $key) {
                    $merged[$key] = round($merged[$key]);
                }
                $out[] = $merged;
            }
        }

        return $out;
    }

    private function call($name, array $params) {
        $futures = [];
        $time1 = microtime(0);
        foreach ($this->connects as $conn) {
            $futures[] = $conn->request($name, $params);
        }
        $results = [];
        foreach ($futures as $future) {
            $line = $future->get();
            if ($line) {
                $results[] = $line;
            }
        }

        return $results;
    }

    public function multi_get($params) {
        $results = $this->call('multi_get', $params);
        $counterSet = [];
        $frame = $results[0];
        foreach ($results as $result) {
            if(is_array($result['data'])) {
                foreach ($result['data'] as $counters) {
                    if (!$counters) {
                        continue;
                    }
                    $name = htmlentities($counters['name']);
                    foreach ($counters['counters'] as $counter) {
                        $time = $counter[0];
                        $counterSet[$name][$time][] = $counter;
                    }
                }
            }
        }
        $outCntr = [];
        foreach ($counterSet as $name => $counters) {
            $out = $this->mergeCounters($counters);
            $outCntr[] = ['name' => $name, 'counters' => $out];
        }

        $frame['data'] = $outCntr;

        return $frame;
    }

    public function get($params) {
        $results = $this->call('get', $params);
        $counters = [];
        if (!isset($results[0])) {
            return [];
        }
        $data = $results[0];
        foreach ($results as $result) {
            if(is_array($result['counters'])) {
                foreach ($result['counters'] as $counter) {
                    $time = $counter[0];
                    $counters[$time][] = $counter;
                }
            }
        }
        $data['counters'] = $this->mergeCounters($counters);

        return $data;
    }

    public function get_names($params) {
        $results = $this->call('get_names', $params);
        $names = [];
        foreach ($results as $result) {
            foreach ($result['names_ts'] as $nameItem) {

                $names[$nameItem['name']][] = $nameItem;
            }
        }
        $out = $results[0];
        $out['names_ts'] = [];
        foreach ($names as $nameItem) {
            $out['names_ts'][] = $nameItem[0];
        }

        return $out;
    }

    public function get_name_tree(array $params) {
        $results = $this->call('get_name_tree', $params);
        $branches = [];

        foreach ($results as $result) {
            if(is_array($result['branches'])) {
                foreach ($result['branches'] as $name) {
                    if ($name == '') {
                        continue;
                    }


                    if (
                        isset($params['prefix'])
                        && in_array($params['prefix'], ['service~~memcache_size_get', 'service~~memcache_size_set', 'service~~memcache_size_del'])
                        && isset($params['ntype'])
                        && $params['ntype'] == 'leaf'
                        && (int)$name !== 0
                    ) {
                        continue;
                    }
                    $branches[] = htmlentities($name);
                }
            }
        }
        $data = $results[0];
        asort($branches);
        $branches = array_values(array_unique($branches));
        $data['branches'] = $branches;

        return $data;
    }

    public function del($name) {
        $this->call('del', ['name' => $name]);
    }
}
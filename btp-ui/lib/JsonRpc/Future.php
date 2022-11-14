<?php
/**
 * Created by PhpStorm.
 * User: mix
 * Date: 14.03.17
 * Time: 16:44
 */
class JsonRpc_Future {
    public $data;
    public $failed = false;
    public $func;
    public function get() {
        if ($this->func) {
            $this->failed = true;
            call_user_func($this->func);
            $this->func = null;
        }
        return $this->data;
    }
    public function onReady($data) {
        $this->data = $data;
        $this->failed = false;
    }
}
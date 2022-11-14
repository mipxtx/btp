<?php
/**
 * Created by PhpStorm.
 * User: mix
 * Date: 14.03.17
 * Time: 16:49
 */

define('ROOT', __DIR__);

spl_autoload_register(
    function ($name){
        $file = __DIR__ . "/lib/" . str_replace("_","/", $name) . ".php";
        if(file_exists($file)){
            require  $file;
        }else{
            error_log('file not found:' . $file);
        }
    }
);
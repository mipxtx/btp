/* vim: et sw=2 ts=2
*/
#ifndef PHP_BTP_H
#define PHP_BTP_H

#ifdef HAVE_CONFIG_H
#include "config.h"
#endif

#include <sys/time.h>
#include <sys/resource.h>
#include <unistd.h>
#include <stdint.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <string.h>

#include "php.h"
#include "php_ini.h"
#include "SAPI.h"
#include "ext/standard/info.h"
#include "ext/standard/php_var.h"
#include "ext/standard/php_string.h"
#include "zend_smart_str.h"

#include "crc32.h"

extern zend_module_entry btp_module_entry;

#ifdef ZTS
#include "TSRM.h"
#endif

#define PHP_BTP_VERSION "0.2.10"

#define BTP_FORMAT_V1 0
#define BTP_FORMAT_V2 1
#define BTP_FORMAT_V3 2

#define BTP_FORMAT_VMIN  BTP_FORMAT_V1
#define BTP_FORMAT_VMAX  BTP_FORMAT_V3
#define BTP_FORMAT_DEFAULT  BTP_FORMAT_V2

#define BTP_CONSTANT_FLAGS (CONST_CS | CONST_PERSISTENT)

typedef struct _btp_list_item_t {
  struct _btp_list_item_t *next;
} btp_list_item_t;

typedef struct {
  btp_list_item_t *first;
  btp_list_item_t *last;
  unsigned count;
} btp_list_t;

#define BTP_HOST_TYPE_SERVER 1
#define BTP_HOST_TYPE_POOL   2

typedef struct {
  zend_uchar id;
} btp_host_t;

typedef struct {
  btp_host_t type;
  int socket;
  zend_string *host;
  zend_string *port;
  zend_uchar format_id;
  struct sockaddr_storage sockaddr;
  size_t sockaddr_len;
  HashTable send_buffer;
  zend_bool is_ok;
} btp_server_t;

typedef struct {
  btp_host_t type;
  HashTable servers_1;
  HashTable servers_2;
} btp_pool_t;

typedef struct {
  btp_list_item_t list_item;
  zend_resource *rsrc;
  zend_bool started;
  zend_string *service;
  zend_string *server;
  zend_string *operation;
  zend_string *script;
  struct timeval start;
  struct timeval value;
  HashTable hosts_ids;
} btp_timer_t;


ZEND_BEGIN_MODULE_GLOBALS(btp)
  HashTable servers_cache;
  HashTable hosts;
  zend_string *script_name;
  zend_string *project_name;

  HashTable globals_hosts_ids;
  zend_string *globals_server;
  zend_string *globals_cnt_all;
  zend_string *globals_cnt_total;
  zend_string *globals_op_memory;
  zend_string *globals_op_all;
  struct timeval globals_req_start;

  zend_bool is_cli;
  zend_bool cli_enable;
  zend_bool fpm_enable;
  btp_list_t timers_completed;
  struct timeval send_timer_start;
  unsigned autoflush_time;
  unsigned autoflush_count;
  unsigned packet_max_len;
ZEND_END_MODULE_GLOBALS(btp)

#define BTP_G(v) ZEND_MODULE_GLOBALS_ACCESSOR(btp, v)

#if defined(ZTS) && defined(COMPILE_DL_BTP)
  ZEND_TSRMLS_CACHE_EXTERN();
#endif

#endif	/* PHP_BTP_H */

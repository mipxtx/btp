/* vim: et sw=2 ts=2
 * Php extension to collect and send script statistical information to Btp daemon.
 *
 *  Author: raven
 */
#include <stdint.h>
#include "php.h"

//1.5 миллисекунды на дороге не валяются =)
//
static zend_always_inline void* btp_memcpy(void *dst, const void *src, size_t len)
{
  uint32_t *dst32 = (uint32_t *)dst, *src32 = (uint32_t *)src;
  for (; len >= sizeof(uint32_t); len -= sizeof(uint32_t)) {
    *dst32++ = *src32++;
  }

  uint8_t *dst8 = (uint8_t *)dst32, *src8 = (uint8_t *)src32;
  for (; len > 0; len--) {
    *dst8++ = *src8++;
  }

  return (void *)dst8;
}

#include "php_btp.h"

ZEND_DECLARE_MODULE_GLOBALS(btp)

#define BTP_RESOURCE_NAME "Btp timer"
#define BTP_MS_IN_SEC 1000000
#define BTP_MAX_INT_STRLEN 32

static int le_btp_timer;
static btp_timer_t* dummy_timer;
static uint8_t *request_buffer = NULL;

#define BTP_ZVAL_TO_TIMER(zval, timer) \
  if ((timer = (btp_timer_t *)zend_fetch_resource(Z_RES_P(zval), BTP_RESOURCE_NAME, le_btp_timer)) == NULL) { \
    php_error_docref(NULL, E_WARNING, "timer is already deleted"); \
    RETURN_FALSE; \
  };

#define timeval_cvt(a, b) do { (a)->tv_sec = (b)->tv_sec; (a)->tv_usec = (b)->tv_usec; } while (0)
#define timeval_zero(a) do { (a)->tv_sec = 0; (a)->tv_usec = 0; } while (0)
#define float_to_timeval(f, t) do { (t).tv_sec = (int)(f); (t).tv_usec = (int)((f - (double)(t).tv_sec) * 1000000.0); } while(0)
#define timeval_us(t) ( 1000000ULL * (t).tv_sec + (t).tv_usec )
#define timeval_ms(t) ( 1000ULL * (t).tv_sec + (t).tv_usec / 1000 )

//----------------------------Utility functions---------------------------------

#define HT_NUM_USED(ht)   ( (ht)->nNumUsed )
#define HT_NUM_ELMTS(ht)  ( (ht)->nNumOfElements )
#define HT_1ST_ELMT(ht)   ( (ht)->arData->val )

static zend_always_inline void btp_list_reset(btp_list_t *list)
{
  list->last = list->first = NULL;
  list->count = 0;
}

static zend_always_inline void btp_list_push(btp_list_t *list, btp_list_item_t *item)
{
  if (EXPECTED(list->last)) {
    list->last = list->last->next = item;
  } else {
    list->last = list->first = item;
  }
  item->next = NULL;
  list->count++;
}

static zend_always_inline btp_list_item_t* btp_list_shift(btp_list_t *list)
{
  btp_list_item_t *item = list->first;
  if (EXPECTED(item)) {
    if (UNEXPECTED(item == list->last)) {
      list->last = list->first = NULL;
    } else {
      list->first = item->next;
    }
    list->count--;
  }
  return item;
}

static zend_always_inline zend_bool btp_enabled() {
  return UNEXPECTED(BTP_G(is_cli)) ? BTP_G(cli_enable) : BTP_G(fpm_enable);
}

static zend_always_inline zend_string* btp_host2str(zend_string *host, zend_string *port)
{
  zend_string *res = zend_string_alloc(ZSTR_LEN(host) + 1 + ZSTR_LEN(port), 0);
  char *p = ZSTR_VAL(res);

  p = btp_memcpy(p, ZSTR_VAL(host), ZSTR_LEN(host));
  *p++ = ':';
  p = btp_memcpy(p, ZSTR_VAL(port), ZSTR_LEN(port));
  *p = '\0';

  return res;
}

//----------------------------Server related functions--------------------------

static btp_server_t* btp_server_ctor(zend_string *host, zend_string *port, zend_long format_id)
{
  struct addrinfo *ai_list = NULL;
  struct addrinfo ai_hints = {0};
#ifdef AI_ADDRCONFIG
  ai_hints.ai_flags   |= AI_ADDRCONFIG;
#endif
  ai_hints.ai_family   = AF_UNSPEC;
  ai_hints.ai_socktype = SOCK_DGRAM;

  int status = getaddrinfo(ZSTR_VAL(host), ZSTR_VAL(port), &ai_hints, &ai_list);
  if (status != 0) {
    php_error_docref(NULL, E_WARNING, "btp failed to resolve hostname '%s': %s", ZSTR_VAL(host), gai_strerror(status));
    return NULL;
  }

  struct addrinfo *ai_ptr;
  int fd;
  for (ai_ptr = ai_list; ai_ptr; ai_ptr = ai_ptr->ai_next) {
    fd = socket(ai_ptr->ai_family, ai_ptr->ai_socktype, ai_ptr->ai_protocol);
    if (EXPECTED(fd >= 0)) {
      btp_server_t *server = pecalloc(1, sizeof(btp_server_t), 1);
      btp_memcpy(&server->sockaddr, ai_ptr->ai_addr, ai_ptr->ai_addrlen);
      server->sockaddr_len = ai_ptr->ai_addrlen;
      freeaddrinfo(ai_list);

      server->type.id = BTP_HOST_TYPE_SERVER;
      server->socket = fd;
      server->host = zend_string_init(ZSTR_VAL(host), ZSTR_LEN(host), 1);
      server->port = zend_string_init(ZSTR_VAL(port), ZSTR_LEN(port), 1);
      server->format_id = (zend_uchar)format_id;
      server->is_ok = 1;
      zend_hash_init(&server->send_buffer, 0, NULL, NULL, 1);

      return server;
    }
  }

  freeaddrinfo(ai_list);
  php_error_docref(NULL, E_WARNING, "btp connect failed %s:%s", ZSTR_VAL(host), ZSTR_VAL(port));
  return NULL;
}

static void btp_server_dtor(zval *zserver)
{
  btp_server_t* server = Z_PTR_P(zserver);

  close(server->socket);
  zend_string_free(server->host);
  zend_string_free(server->port);
  zend_hash_destroy(&server->send_buffer);

  pefree(server, 1);
}

static HashTable* btp_server_dump(zval *dst, btp_server_t *server)
{
  add_assoc_stringl(dst, "host", ZSTR_VAL(server->host), ZSTR_LEN(server->host));
  add_assoc_stringl(dst, "port", ZSTR_VAL(server->port), ZSTR_LEN(server->port));
  add_assoc_bool(dst, "is_connected", server->socket > 0);
}

static zend_always_inline btp_server_t* btp_server_get_cached(zend_string *host, zend_string *port, zend_long format_id)
{
  zend_string *key = btp_host2str(host, port);
  btp_server_t *server;

  if (EXPECTED((server = zend_hash_find_ptr(&BTP_G(servers_cache), key)) && server->is_ok)) {
    zend_string_free(key);
    return server;
  }

  if (EXPECTED(server = btp_server_ctor(host, port, format_id))) {
    zend_string *pkey = zend_string_init(ZSTR_VAL(key), ZSTR_LEN(key), 1);
    zval zserver;
    ZVAL_PTR(&zserver, server);
    if (zend_hash_update(&BTP_G(servers_cache), pkey, &zserver) == NULL) {
      btp_server_dtor(&zserver);
      server = NULL;
    }
    zend_string_release(pkey);
  }

  zend_string_free(key);
  return server;
}

//----------------------------Pools related functions---------------------------

static zend_bool btp_pool_add_from_array(HashTable *dst, HashTable *src)
{
  zval *el;
  //
  // ['host' => '10.0.0.0', 'port' => '31337', 'format_id' => 1,],
  // ['host' => '10.0.0.1', 'port' => '42',],
  //
  ZEND_HASH_FILL_PACKED(dst) {
    ZEND_HASH_FOREACH_VAL(src, el) {
      ZVAL_DEREF(el);

      if (UNEXPECTED(Z_TYPE_P(el) != IS_ARRAY))
        goto __pool_config_params_error;

      zval *zhost = zend_hash_str_find(Z_ARRVAL_P(el), "host", strlen("host"));
      if (UNEXPECTED(zhost == NULL))
        goto __pool_config_params_error;

      ZVAL_DEREF(zhost);
      if (UNEXPECTED(Z_TYPE_P(zhost) != IS_STRING))
        goto __pool_config_params_error;

      zval *zport = zend_hash_str_find(Z_ARRVAL_P(el), "port", strlen("port"));
      if (UNEXPECTED(zport == NULL))
        goto __pool_config_params_error;

      ZVAL_DEREF(zport);
      if (UNEXPECTED(Z_TYPE_P(zport) != IS_STRING && (Z_TYPE_P(zport) != IS_LONG || Z_LVAL_P(zport) <= 0)))
        goto __pool_config_params_error;

      zend_long format_id = BTP_FORMAT_DEFAULT;
      zval *zformat = zend_hash_str_find(Z_ARRVAL_P(el), "format_id", strlen("format_id"));
      if (UNEXPECTED(zformat != NULL)) {
        ZVAL_DEREF(zformat);
        if (Z_TYPE_P(zformat) == IS_LONG) {
          format_id = Z_LVAL_P(zformat);
        }
        else if (Z_TYPE_P(zformat) == IS_STRING) {
          zend_long tmp;
          if (ZEND_HANDLE_NUMERIC(Z_STR_P(zformat), tmp))
            format_id = tmp;
        }
        if (format_id < BTP_FORMAT_VMIN || format_id > BTP_FORMAT_VMAX) {
          php_error_docref(NULL, E_WARNING, "btp format id is not valid, default is used! (%ld)", format_id);
          format_id = BTP_FORMAT_DEFAULT;
        }
      }

      zend_string *port;
      if (Z_TYPE_P(zport) == IS_LONG) {
        char tmp[ BTP_MAX_INT_STRLEN ];
        char *end = tmp + sizeof(tmp) - 1;
        char *str = zend_print_ulong_to_buf(end, Z_LVAL_P(zport));
        port = zend_string_init(str, end - str, 0);
      } else {
        port = zend_string_copy(Z_STR_P(zport));
      }

      btp_server_t *server = btp_server_get_cached(Z_STR_P(zhost), port, format_id);
      zend_string_release(port);

      if (UNEXPECTED(server == NULL)) return 0;

      zval zserver;
      ZVAL_PTR(&zserver, server);
      ZEND_HASH_FILL_ADD(&zserver);

    } ZEND_HASH_FOREACH_END();
  } ZEND_HASH_FILL_END();

  return 1;

__pool_config_params_error:
  {
    smart_str buf = {0};
    php_var_export_ex(el, 1, &buf);
    smart_str_0(&buf);
    php_error_docref(NULL, E_WARNING, "unrecognized server config params: %s", ZSTR_VAL(buf.s));
    smart_str_free(&buf);
  }
  return 0;
}

static zend_always_inline btp_pool_t* btp_pool_ctor(uint32_t size_1, uint32_t size_2)
{
  btp_pool_t *pool = pemalloc(sizeof(btp_pool_t), 0);
  pool->type.id = BTP_HOST_TYPE_POOL;

  zend_hash_init(&pool->servers_1, size_1, NULL, NULL, 0);
  zend_hash_real_init(&pool->servers_1, 1);

  zend_hash_init(&pool->servers_2, size_2, NULL, NULL, 0);
  zend_hash_real_init(&pool->servers_2, 1);

  return pool;
}

static zend_always_inline void btp_pool_release(btp_pool_t *pool)
{
  zend_hash_destroy(&pool->servers_1);
  zend_hash_destroy(&pool->servers_2);
  pefree(pool, 0);
}

static zend_always_inline btp_server_t* btp_pool_choose_server(HashTable *servers, zend_string *key)
{
  if (HT_NUM_USED(servers) > 1) {
    zend_ulong idx = crc32(ZSTR_VAL(key), ZSTR_LEN(key)) % HT_NUM_USED(servers);
    return (btp_server_t *)zend_hash_index_find_ptr(servers, idx);
  }

  if (HT_NUM_USED(servers) == 1) {
    return (btp_server_t *)Z_PTR(HT_1ST_ELMT(servers));
  }

  return NULL;
}

static HashTable* btp_pool_dump(zval *dst, btp_pool_t *pool)
{
  zval *zi;

  zval zservers_1;
  array_init(&zservers_1);
  add_assoc_zval(dst, "servers_1", &zservers_1);

  ZEND_HASH_FOREACH_VAL(&pool->servers_1, zi) {
    zval zserver;
    array_init(&zserver);
    btp_server_dump(&zserver, (btp_server_t *)Z_PTR_P(zi));
    zend_hash_next_index_insert_new(Z_ARRVAL(zservers_1), &zserver);
  } ZEND_HASH_FOREACH_END();

  zval zservers_2;
  array_init(&zservers_2);
  add_assoc_zval(dst, "servers_2", &zservers_2);

  ZEND_HASH_FOREACH_VAL(&pool->servers_2, zi) {
    zval zserver;
    array_init(&zserver);
    btp_server_dump(&zserver, (btp_server_t *)Z_PTR_P(zi));
    zend_hash_next_index_insert_new(Z_ARRVAL(zservers_2), &zserver);
  } ZEND_HASH_FOREACH_END();
}

//----------------------------Hosts layer related functions---------------------

static zend_always_inline zend_uchar btp_host_get_type(void *host) {
  return ((btp_host_t *)host)->id;
}

static zend_always_inline zend_bool btp_host_is_server(void *host) {
  return btp_host_get_type(host) == BTP_HOST_TYPE_SERVER;
}

static zend_always_inline zend_bool btp_host_is_pool(void *host) {
  return btp_host_get_type(host) == BTP_HOST_TYPE_POOL;
}

static void btp_host_dtor(zval *zhost)
{
  if (btp_host_is_pool(Z_PTR_P(zhost))) {
    btp_pool_release((btp_pool_t *)Z_PTR_P(zhost));
  }
  // servers handled in BTP_G(servers_cache)
}

static zend_always_inline zend_bool btp_add_host_id(HashTable *dst, zval *zarg)
{
  zend_long host_id;

  if (EXPECTED(Z_TYPE_P(zarg) == IS_LONG)) {
    host_id = Z_LVAL_P(zarg);
  }
  else if (Z_TYPE_P(zarg) != IS_STRING || !ZEND_HANDLE_NUMERIC(Z_STR_P(zarg), host_id) || host_id < 0) {
    php_error_docref(NULL, E_WARNING, "btp host id is not valid, should be int between 0 and %ld", ZEND_LONG_MAX);
    return 0;
  }

  void *host;
  if (UNEXPECTED((host = zend_hash_index_find_ptr(&BTP_G(hosts), (zend_ulong)host_id)) == NULL)) {
    php_error_docref(NULL, E_WARNING, "btp host id %ld is not found!", host_id);
    return 0;
  }

  zend_hash_index_add_ptr(dst, (zend_ulong)host_id, host);
  return 1;
}

static zend_always_inline zend_bool btp_set_hosts_ids(HashTable *dst, zval *zarg)
{
  if (UNEXPECTED(HT_NUM_ELMTS(dst))) {
    zend_hash_clean(dst);
  }

  if (EXPECTED(Z_TYPE_P(zarg) == IS_ARRAY)) {
    zval *zi;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(zarg), zi) {
      ZVAL_DEREF(zi);
      if (!btp_add_host_id(dst, zi)) return 0;
    } ZEND_HASH_FOREACH_END();

    return 1;
  }

  return btp_add_host_id(dst, zarg);
}

//----------------------------Timers related functions--------------------------

static zend_always_inline btp_timer_t* btp_timer_ctor(
    zend_string *service,
    zend_string *server,
    zend_string *operation,
    zend_string *script
) {
  btp_timer_t *timer = pemalloc(sizeof(btp_timer_t), 0);

  timer->rsrc = NULL;
  timer->started = 0;

  timer->service = service ? php_addslashes(service) : NULL;
  timer->server = server ? php_addslashes(server) : NULL;
  timer->operation = operation ? php_addslashes(operation) : NULL;
  timer->script = script ? php_addslashes(script) : NULL;

  timeval_zero(&timer->start);
  timeval_zero(&timer->value);

  zend_hash_init(&timer->hosts_ids, 0, NULL, NULL, 0);

  return timer;
}

static zend_always_inline void btp_timer_release(btp_timer_t *timer)
{
  if (timer->service) {
    zend_string_release(timer->service);
  }
  if (timer->server) {
    zend_string_release(timer->server);
  }
  if (timer->operation) {
    zend_string_release(timer->operation);
  }
  if (timer->script) {
    zend_string_release(timer->script);
  }
  zend_hash_destroy(&timer->hosts_ids);

  pefree(timer, 0);
}

static void btp_timer_resource_dtor(zend_resource *entry) {
  btp_timer_release((btp_timer_t *)entry->ptr);
}

static void zend_always_inline btp_timer_register_resource(btp_timer_t *timer) {
  timer->rsrc = Z_RES_P(zend_list_insert(timer, le_btp_timer));
}

static zend_always_inline void btp_timer_start(btp_timer_t *timer)
{
  if (EXPECTED(gettimeofday(&timer->start, 0) == 0)) {
    timer->started = 1;
  }
}

static zend_always_inline void btp_timer_stop(btp_timer_t *timer)
{
  if (EXPECTED(timer->started)) {
    struct timeval now;
    if (EXPECTED(gettimeofday(&now, 0) == 0)) {
      timersub(&now, &timer->start, &timer->value);
      btp_list_push(&BTP_G(timers_completed), &timer->list_item);
    }
    timer->started = 0;
  }
}

static zend_always_inline void btp_timer_stop_all()
{
  zval *zle;
  ZEND_HASH_FOREACH_VAL(&EG(regular_list), zle) {
    if (Z_RES_P(zle)->type == le_btp_timer) {
      btp_timer_stop((btp_timer_t *)Z_RES_P(zle)->ptr);
    }
  } ZEND_HASH_FOREACH_END();
}

static zend_always_inline void btp_timer_count_and_stop(btp_timer_t *timer, zend_long time_value)
{
  if (time_value) {
    timer->value.tv_sec = time_value / BTP_MS_IN_SEC;
    timer->value.tv_usec = time_value % BTP_MS_IN_SEC;
  }
  btp_list_push(&BTP_G(timers_completed), &timer->list_item);
}

static void btp_on_disable()
{
  zval *zle;
  ZEND_HASH_FOREACH_VAL(&EG(regular_list), zle) {
    if (Z_RES_P(zle)->type == le_btp_timer) {
      ((btp_timer_t *)Z_RES_P(zle)->ptr)->started = 0;
    }
  } ZEND_HASH_FOREACH_END();
}

static HashTable* btp_timer_dump(zval *dst, btp_timer_t *timer)
{
  add_assoc_str(dst, "server", zend_string_copy(timer->server));
  add_assoc_str(dst, "operation", zend_string_copy(timer->operation));
  add_assoc_str(dst, "service", zend_string_copy(timer->service));

  if (timer->script) {
    add_assoc_str(dst, "script", zend_string_copy(timer->script));
  }

  add_assoc_bool(dst, "started", timer->started);
  add_assoc_long(dst, "start.sec", timer->start.tv_sec);
  add_assoc_long(dst, "start.usec", timer->start.tv_usec);

  if (!timer->started) {
    add_assoc_long(dst, "len.sec", timer->value.tv_sec);
    add_assoc_long(dst, "len.usec", timer->value.tv_usec);
  }

  zval zhosts_ids;
  array_init(&zhosts_ids);
  add_assoc_zval(dst, "hosts_ids", &zhosts_ids);

  zend_ulong idx;
  zval zidx;
  ZEND_HASH_FOREACH_NUM_KEY(&timer->hosts_ids, idx) {
    ZVAL_LONG(&zidx, idx);
    zend_hash_next_index_insert_new(Z_ARRVAL(zhosts_ids), &zidx);
  } ZEND_HASH_FOREACH_END();
}

//----------------------------Data preparation & sending------------------------
/*
{
  "jsonrpc":"2.0",
  "method":"publish",
  "params":{
    "channel":"btp2.rt",
    "content":[
       { "name":"service~~service1~~server1~~op1", "cl":[1,1,1]},
       { "name":"service~~service1~~server1~~op2", "cl":[2,2,2]},
       { "name":"service~~service2~~server1~~op1", "cl":[3,3,3]},
       { "name":"service~~service2~~server1~~op2", "cl":[4,4,4]},
       { "name":"service~~service1~~op1", "cl":[1,1,1]},
       { "name":"service~~service1~~op2", "cl":[2,2,2]},
       { "name":"service~~service2~~op1", "cl":[3,3,3]},
       { "name":"service~~service2~~op2", "cl":[4,4,4]},
       { "name":"script~~script1.phtml~~service1~~op1", "cl":[1,1,1]},
       { "name":"script~~script1.phtml~~service1~~op2", "cl":[2,2,2]},
       { "name":"script~~script1.phtml~~service2~~op1", "cl":[3,3,3]},
       { "name":"script~~script1.phtml~~service2~~op2", "cl":[4,4,4]}
    ]
  }
}
*/

/*
{
  "jsonrpc":"2.0",
  "method": "multi_add",
  "id": 1,
  "params": {
    "data": [
      {"name": "a", "cl": [1,2,3,4,5,6,7,8,9,...]},
      {"name": "b", "cl": [1,2,3,4,5,6,7,8,9,...]},
      ...
    ]
  }
}
*/

#define KEY_SERVICE "service~~"
#define KEY_SCRIPT "script~~"
#define SEPARATOR "~~"

#define OPENER "{\"jsonrpc\":\"2.0\",\"method\":\"publish\",\"params\":{\"channel\":\"btp2.rt\",\"content\":["
#define OPENER_V2 "{\"jsonrpc\":\"2.0\",\"method\":\"multi_add\",\"params\":{\"data\":["
#define CLOSER "]}}\r\n"
#define ITEM_OPEN "{\"name\":\""
#define ITEM_CL "\",\"cl\":["
#define ITEM_CLOSE "]}"
#define COMMA ','
#define COMMA_LEN 1

static zend_always_inline HashTable* btp_timers_add_array_for_key(HashTable *hash, char *key, size_t key_len)
{
  zval *res = zend_hash_str_find(hash, key, key_len);

  if (EXPECTED(res == NULL)) {
    zval zres;
    ZVAL_NEW_ARR(&zres);
    zend_hash_init(Z_ARRVAL(zres), 0, NULL, NULL, 0);

    zend_string *zkey = zend_string_init(key, key_len, 0);
    res = zend_hash_add_new(hash, zkey, &zres);
    zend_string_release(zkey);
  }

  return Z_ARRVAL_P(res);
}

//собирает и удаляет счетчики для одного сервера
static zend_always_inline void btp_timers_add_service_data(HashTable *hash, btp_timer_t *t)
{
  //{ "name":"service~~service1~~server1~~op1", "cl":[1,1,1]},
  // выделим побольше памяти заранее, чтобы не перевыделять потом
  size_t key_len = strlen(KEY_SERVICE) + 2 * strlen(SEPARATOR) + ZSTR_LEN(t->service) + ZSTR_LEN(t->server) + ZSTR_LEN(t->operation);

  char *key, *offset;
  key = offset = emalloc(key_len);

  //{ "name":"service~~service1~~op1", "cl":[1,1,1]},
  key_len = strlen(KEY_SERVICE) + strlen(SEPARATOR) + ZSTR_LEN(t->service) + ZSTR_LEN(t->operation);

  offset = btp_memcpy( offset, KEY_SERVICE, strlen(KEY_SERVICE) );
  offset = btp_memcpy( offset, ZSTR_VAL(t->service), ZSTR_LEN(t->service) );
  offset = btp_memcpy( offset, SEPARATOR, strlen(SEPARATOR) );
           btp_memcpy( offset, ZSTR_VAL(t->operation), ZSTR_LEN(t->operation) );

  zval value;
  ZVAL_LONG(&value, timeval_us(t->value));

  zend_hash_next_index_insert_new( btp_timers_add_array_for_key(hash, key, key_len), &value );

  //{ "name":"service~~service1~~server1~~op1", "cl":[1,1,1]},
  key_len = strlen(KEY_SERVICE) + 2 * strlen(SEPARATOR) + ZSTR_LEN(t->service) + ZSTR_LEN(t->server) + ZSTR_LEN(t->operation);

  offset = btp_memcpy( offset, ZSTR_VAL(t->server), ZSTR_LEN(t->server) );
  offset = btp_memcpy( offset, SEPARATOR, strlen(SEPARATOR) );
           btp_memcpy( offset, ZSTR_VAL(t->operation), ZSTR_LEN(t->operation) );

  zend_hash_next_index_insert_new( btp_timers_add_array_for_key(hash, key, key_len), &value );

  efree(key);
}

static zend_always_inline void btp_timers_add_script_data(HashTable *hash, btp_timer_t *t, zend_string *script)
{
  // { "name":"script~~script1.phtml~~service1~~op1", "cl":[1,1,1]},
  size_t key_len = strlen(KEY_SCRIPT) + 2 * strlen(SEPARATOR) + ZSTR_LEN(script) + ZSTR_LEN(t->service) + ZSTR_LEN(t->operation);

  char *key, *offset;
  key = offset = emalloc(key_len);

  offset = btp_memcpy( offset, KEY_SCRIPT, strlen(KEY_SCRIPT) );
  offset = btp_memcpy( offset, ZSTR_VAL(script), ZSTR_LEN(script) );
  offset = btp_memcpy( offset, SEPARATOR, strlen(SEPARATOR) );
  offset = btp_memcpy( offset, ZSTR_VAL(t->service), ZSTR_LEN(t->service) );
  offset = btp_memcpy( offset, SEPARATOR, strlen(SEPARATOR) );
           btp_memcpy( offset, ZSTR_VAL(t->operation), ZSTR_LEN(t->operation) );

  zval value;
  ZVAL_LONG(&value, timeval_us(t->value));

  zend_hash_next_index_insert_new( btp_timers_add_array_for_key(hash, key, key_len), &value );

  efree(key);
}

static zend_always_inline void btp_request_send(void *buf, size_t len, btp_server_t *server)
{
  while (len > 0) {
    ssize_t sent = sendto(server->socket, buf, len, 0, (struct sockaddr *)&server->sockaddr, server->sockaddr_len);
    if (UNEXPECTED(sent < 0)) {
      php_error_docref(NULL, E_WARNING, "btp send failed to %s:%s, errno %d", ZSTR_VAL(server->host), ZSTR_VAL(server->port), errno);
      server->is_ok = 0;
      return;
    }
    buf += sent;
    len -= sent;
  }
}

static void btp_request_prepare_and_send(btp_server_t *server)
{
  uint8_t *preq, *pend;
  unsigned left, left_max = BTP_G(packet_max_len);

  if (EXPECTED(server->format_id == BTP_FORMAT_V2)) {
    preq = btp_memcpy(request_buffer, OPENER_V2, strlen(OPENER_V2));
    left_max -= strlen(OPENER_V2);
  } else {
    preq = btp_memcpy(request_buffer, OPENER, strlen(OPENER));
    left_max -= strlen(OPENER);
  }

  left_max -= strlen(CLOSER);
  pend = preq;
  left = left_max;

  zval *values;
  zend_string *key;
  ZEND_HASH_FOREACH_STR_KEY_VAL(&server->send_buffer, key, values) {
    zval *value;
    unsigned klen = strlen(ITEM_OPEN) + strlen(ITEM_CL) + strlen(ITEM_CLOSE) + ZSTR_LEN(key);

    if (UNEXPECTED(klen > left_max / 2)) {
      php_error_docref(NULL, E_WARNING, "btp key %s is too large - more than half of max packet payload length", ZSTR_VAL(key));
      goto __skip_key;
    }
    if (UNEXPECTED(left < klen + BTP_MAX_INT_STRLEN + COMMA_LEN)) {
      goto __send_continue_key;
    }

__continue_key:
    pend = btp_memcpy(pend, ITEM_OPEN, strlen(ITEM_OPEN));
    pend = btp_memcpy(pend, ZSTR_VAL(key), ZSTR_LEN(key));
    pend = btp_memcpy(pend, ITEM_CL, strlen(ITEM_CL));
    left -= klen;

    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(values), value) {
      char vtmp[ BTP_MAX_INT_STRLEN ];
      char *vend = vtmp + sizeof(vtmp) - 1;
      char *vptr = zend_print_ulong_to_buf(vend, Z_LVAL_P(value));
      unsigned vlen = vend - vptr;

      if (UNEXPECTED(left < vlen + COMMA_LEN)) {
        pend = btp_memcpy(--pend, ITEM_CLOSE, strlen(ITEM_CLOSE));
        pend++;

__send_continue_key:
        pend = btp_memcpy(--pend, CLOSER, strlen(CLOSER));
        btp_request_send(request_buffer, pend - request_buffer, server);
        pend = preq;
        left = left_max;
        goto __continue_key;
      }

      left -= vlen + COMMA_LEN;
      pend = btp_memcpy(pend, vptr, vlen);
      *pend++ = COMMA;

      ZVAL_UNDEF(value);
    } ZEND_HASH_FOREACH_END();

    pend = btp_memcpy(--pend, ITEM_CLOSE, strlen(ITEM_CLOSE));
    *pend++ = COMMA;

__skip_key:
    zend_array_destroy(Z_ARRVAL_P(values));
  } ZEND_HASH_FOREACH_END();

  pend = btp_memcpy(--pend, CLOSER, strlen(CLOSER));
  btp_request_send(request_buffer, pend - request_buffer, server);
  zend_hash_clean(&server->send_buffer);
}

static void btp_timer_to_server(btp_timer_t *timer)
{
  zend_string *script = timer->script ? timer->script : BTP_G(script_name);

  zval *zi;
  ZEND_HASH_FOREACH_VAL(&timer->hosts_ids, zi) {
    switch (btp_host_get_type(Z_PTR_P(zi))) {

      case BTP_HOST_TYPE_POOL:
        {
          btp_pool_t *pool = (btp_pool_t *)Z_PTR_P(zi);
          btp_server_t *server;

          if (server = btp_pool_choose_server(&pool->servers_1, timer->service)) {
            btp_timers_add_service_data(&server->send_buffer, timer);
          }
          if (script && (server = btp_pool_choose_server(&pool->servers_2, script))) {
            btp_timers_add_script_data(&server->send_buffer, timer, script);
          }
        } break;

      case BTP_HOST_TYPE_SERVER:
        {
          btp_server_t *server = (btp_server_t *)Z_PTR_P(zi);

          btp_timers_add_service_data(&server->send_buffer, timer);
          if (script) {
            btp_timers_add_script_data(&server->send_buffer, timer, script);
          }
        } break;
    }
  } ZEND_HASH_FOREACH_END();
}

//отправляет в btp все остановленные счетчики
static void btp_flush_data()
{
  btp_timer_t *timer, *next;
  for (timer = (btp_timer_t *)BTP_G(timers_completed).first; timer; timer = next) {
    btp_timer_to_server(timer);
    next = (btp_timer_t *)timer->list_item.next;

    if (EXPECTED(timer->rsrc)) {
      if (UNEXPECTED(BTP_G(is_cli))) {
        zend_list_delete(timer->rsrc);
      }
    } else {
      btp_timer_release(timer);
    }
  }

  btp_list_reset(&BTP_G(timers_completed));

  zval *zserver;
  ZEND_HASH_FOREACH_VAL(&BTP_G(servers_cache), zserver) {
    btp_server_t *server = (btp_server_t *)Z_PTR_P(zserver);
    if (EXPECTED(HT_NUM_ELMTS(&server->send_buffer))) {
      btp_request_prepare_and_send(server);
    }
  } ZEND_HASH_FOREACH_END();
}

static zend_always_inline void btp_autoflush()
{
  if (EXPECTED(BTP_G(autoflush_count))) {
    if (UNEXPECTED(BTP_G(timers_completed).count >= BTP_G(autoflush_count))) {
      btp_flush_data();
      return;
    }
  }

  if (EXPECTED(BTP_G(autoflush_time))) {
    struct timeval now;
    if (UNEXPECTED(gettimeofday(&now, 0) == 0 && timeval_ms(now) - timeval_ms(BTP_G(send_timer_start)) >= BTP_G(autoflush_time))) {
      timeval_cvt(&BTP_G(send_timer_start), &now);
      btp_flush_data();
      return;
    }
  }
}

//----------------------------Gobals related functions-------------------------------

static int (*send_headers_cb)(sapi_headers_struct *sapi_headers);
static int btp_send_headers_cb(sapi_headers_struct *sapi_headers);

static zend_always_inline void globals_module_init()
{
  char hostname[128] = {0};
  gethostname(hostname, sizeof(hostname) - 1);
  BTP_G(globals_server) = zend_string_init(hostname, strlen(hostname), 1);

  char hostgroup[150] = {0};
  unsigned len = 0;
  char *src = hostname;

  for (; len < sizeof(hostgroup) && *src; src++)
  if (EXPECTED(*src < '0' || *src > '9')) {
    hostgroup[len++] = *src;
  }

  BTP_G(globals_cnt_all)   = zend_string_alloc(len + strlen("SCRIPT_"), 1);
  BTP_G(globals_cnt_total) = zend_string_alloc(len + strlen("SCRIPT_total_"), 1);

  src = ZSTR_VAL(BTP_G(globals_cnt_all));
  src = btp_memcpy(src, "SCRIPT_", strlen("SCRIPT_"));
        btp_memcpy(src, hostgroup, len);

  src = ZSTR_VAL(BTP_G(globals_cnt_total));
  src = btp_memcpy(src, "SCRIPT_total_", strlen("SCRIPT_total_"));
        btp_memcpy(src, hostgroup, len);

  BTP_G(globals_op_memory) = zend_string_init("memory", strlen("memory"), 1);
  BTP_G(globals_op_all)    = zend_string_init("all", strlen("all"), 1);

  zend_hash_init(&BTP_G(globals_hosts_ids), 0, NULL, NULL, 1);

  send_headers_cb = sapi_module.send_headers;
  sapi_module.send_headers = btp_send_headers_cb;
}

static zend_always_inline void globals_module_shutdown()
{
  sapi_module.send_headers = send_headers_cb;
  zend_hash_destroy(&BTP_G(globals_hosts_ids));

  zend_string_free(BTP_G(globals_op_memory));
  zend_string_free(BTP_G(globals_op_all));

  zend_string_free(BTP_G(globals_server));
  zend_string_free(BTP_G(globals_cnt_all));
  zend_string_free(BTP_G(globals_cnt_total));
}

static zend_always_inline void globals_request_init()
{
  if (UNEXPECTED(gettimeofday(&BTP_G(globals_req_start), 0)))
    timeval_zero(&BTP_G(globals_req_start));
}

static zend_always_inline zend_string* globals_get_project_name(zend_string *prefix)
{
  const unsigned len = BTP_G(project_name) ? ZSTR_LEN(BTP_G(project_name)) : strlen("default");
  zend_string *result = zend_string_alloc(ZSTR_LEN(prefix) + 1 + len, 0);
  char *p = ZSTR_VAL(result);

  p = btp_memcpy(p, ZSTR_VAL(prefix), ZSTR_LEN(prefix));
  *p++ = '_';
  p = btp_memcpy(p, BTP_G(project_name) ? ZSTR_VAL(BTP_G(project_name)) : "default", len);
  *p = '\0';

  return result;
}

static void globals_send(zend_string *service)
{
  if (UNEXPECTED(!BTP_G(script_name) || HT_NUM_ELMTS(&BTP_G(globals_hosts_ids)) == 0)) return;

  btp_timer_t timer = {0};
  zend_hash_init(&timer.hosts_ids, HT_NUM_ELMTS(&BTP_G(globals_hosts_ids)), NULL, NULL, 0);
  zend_hash_real_init(&timer.hosts_ids, 1);

  ZEND_HASH_FILL_PACKED(&timer.hosts_ids) {
    zval *zi;
    ZEND_HASH_FOREACH_VAL(&BTP_G(globals_hosts_ids), zi) {
      ZEND_HASH_FILL_ADD(zi);
    } ZEND_HASH_FOREACH_END();
  } ZEND_HASH_FILL_END();

  timer.server = BTP_G(globals_server);
  timer.operation = BTP_G(globals_op_memory);
  timer.value.tv_usec = zend_memory_peak_usage(1);

  timer.service = service;
  btp_timer_to_server(&timer);

  zend_string *project_name = globals_get_project_name(service);
  timer.service = project_name;
  btp_timer_to_server(&timer);

  struct timeval req_finish;
  if (EXPECTED((BTP_G(globals_req_start).tv_sec || BTP_G(globals_req_start).tv_usec) && gettimeofday(&req_finish, 0) == 0))
  {
    timer.operation = BTP_G(globals_op_all);
    timersub(&req_finish, &BTP_G(globals_req_start), &timer.value);

    timer.service = service;
    btp_timer_to_server(&timer);

    timer.service = project_name;
    btp_timer_to_server(&timer);
  }

  zend_string_free(project_name);
  zend_hash_destroy(&timer.hosts_ids);
}

static int btp_send_headers_cb(sapi_headers_struct *sapi_headers)
{
  globals_send(BTP_G(globals_cnt_all));
  return send_headers_cb ? send_headers_cb(sapi_headers) : SAPI_HEADER_DO_SEND;
}

static zend_always_inline void globals_request_shutdown()
{
  globals_send(BTP_G(globals_cnt_total));
  zend_hash_clean(&BTP_G(globals_hosts_ids));
}

//----------------------------Extension functions------------------------------------

//proto bool btp_config_server_set(int id, string host, int port, int format_id)
static PHP_FUNCTION(btp_config_server_set)
{
  zend_string *zhost, *zport;
  zend_long host_id = -1, format_id = BTP_FORMAT_DEFAULT;

  ZEND_PARSE_PARAMETERS_START(3, 4)
    Z_PARAM_LONG(host_id)
    Z_PARAM_STR(zhost)
    Z_PARAM_STR(zport)
    Z_PARAM_OPTIONAL
    Z_PARAM_LONG(format_id)
  ZEND_PARSE_PARAMETERS_END_EX(RETURN_FALSE);

  if (UNEXPECTED(host_id < 0)) {
    php_error_docref(NULL, E_WARNING, "btp host id is not valid, should be int between 0 and %ld", ZEND_LONG_MAX);
    RETURN_FALSE;
  }
  if (UNEXPECTED(format_id < BTP_FORMAT_VMIN || format_id > BTP_FORMAT_VMAX)) {
    php_error_docref(NULL, E_WARNING, "btp format id is not valid, default is used! (%ld)", format_id);
    format_id = BTP_FORMAT_DEFAULT;
  }
  if (UNEXPECTED(zend_hash_index_find(&BTP_G(hosts), (zend_ulong)host_id))) {
    php_error_docref(NULL, E_WARNING, "btp host %ld already exists", host_id);
    RETURN_FALSE;
  }

  btp_server_t *server = btp_server_get_cached(zhost, zport, format_id);
  if (UNEXPECTED(server == NULL || zend_hash_index_add_ptr(&BTP_G(hosts), (zend_ulong)host_id, server) == NULL)) {
    RETURN_FALSE;
  }

  RETURN_TRUE;
}

static PHP_FUNCTION(btp_config_server_pool)
{
  zend_long host_id = -1;
  HashTable *servers_1, *servers_2;

  ZEND_PARSE_PARAMETERS_START(3, 3)
    Z_PARAM_LONG(host_id)
    Z_PARAM_ARRAY_HT(servers_1)
    Z_PARAM_ARRAY_HT(servers_2)
  ZEND_PARSE_PARAMETERS_END_EX(RETURN_FALSE);

  if (UNEXPECTED(host_id < 0)) {
    php_error_docref(NULL, E_WARNING, "btp host id is not valid, should be int between 0 and %ld", ZEND_LONG_MAX);
    RETURN_FALSE;
  }
  if (UNEXPECTED(HT_NUM_ELMTS(servers_1) == 0 && HT_NUM_ELMTS(servers_2) == 0)) {
    php_error_docref(NULL, E_WARNING, "both pools are empty");
    RETURN_FALSE;
  }
  if (UNEXPECTED(zend_hash_index_find(&BTP_G(hosts), (zend_ulong)host_id))) {
    php_error_docref(NULL, E_WARNING, "btp host %ld already exists", host_id);
    RETURN_FALSE;
  }

  btp_pool_t *pool = btp_pool_ctor(HT_NUM_ELMTS(servers_1), HT_NUM_ELMTS(servers_2));
  if (UNEXPECTED(
    !btp_pool_add_from_array(&pool->servers_1, servers_1) ||
    !btp_pool_add_from_array(&pool->servers_2, servers_2) ||
    zend_hash_index_add_ptr(&BTP_G(hosts), (zend_ulong)host_id, pool) == NULL
  )) {
    btp_pool_release(pool);
    RETURN_FALSE;
  }

  RETURN_TRUE;
}

//proto bool btp_dump()
static PHP_FUNCTION(btp_dump)
{
  array_init(return_value);

  if (BTP_G(script_name)) {
    add_assoc_str(return_value, "script_name", zend_string_copy(BTP_G(script_name)));
  }
  if (BTP_G(project_name)) {
    add_assoc_str(return_value, "project_name", zend_string_copy(BTP_G(project_name)));
  }

  add_assoc_bool(return_value, "is_cli", BTP_G(is_cli));
  add_assoc_double(return_value, "send_timer_start", (double)timeval_ms(BTP_G(send_timer_start)) / 1000.0);

  //hosts
  zval zhosts_list;
  array_init(&zhosts_list);
  add_assoc_zval(return_value, "hosts", &zhosts_list);

  zval *zle;
  zend_ulong idx;
  ZEND_HASH_FOREACH_NUM_KEY_VAL(&BTP_G(hosts), idx, zle) {
    zval zhost;
    array_init(&zhost);
    add_assoc_long(&zhost, "id", idx);

    switch (btp_host_get_type(Z_PTR_P(zle))) {

      case BTP_HOST_TYPE_POOL:
        add_assoc_stringl(&zhost, "type", "pool", strlen("pool"));
        btp_pool_dump(&zhost, (btp_pool_t *)Z_PTR_P(zle));
        break;

      case BTP_HOST_TYPE_SERVER:
        add_assoc_stringl(&zhost, "type", "server", strlen("server"));
        btp_server_dump(&zhost, (btp_server_t *)Z_PTR_P(zle));
        break;
    }

    zend_hash_next_index_insert_new(Z_ARR(zhosts_list), &zhost);
  } ZEND_HASH_FOREACH_END();

  zval ztimer_list;
  array_init(&ztimer_list);
  add_assoc_zval(return_value, "timers", &ztimer_list);

  ZEND_HASH_FOREACH_VAL(&EG(regular_list), zle) {
    if (Z_RES_P(zle)->type != le_btp_timer) continue;

    btp_timer_t *timer = (btp_timer_t *)Z_RES_P(zle)->ptr;
    if (timer == dummy_timer) continue;

    zval ztimer;
    array_init(&ztimer);
    btp_timer_dump(&ztimer, timer);

    zend_hash_next_index_insert_new(Z_ARR(ztimer_list), &ztimer);
  } ZEND_HASH_FOREACH_END();
}

//proto bool btp_dump_timer(resource timer)
static PHP_FUNCTION(btp_dump_timer)
{
  zval *zvtimer;

  ZEND_PARSE_PARAMETERS_START(1, 1)
    Z_PARAM_RESOURCE(zvtimer)
  ZEND_PARSE_PARAMETERS_END_EX(RETURN_FALSE);

  btp_timer_t *timer;
  BTP_ZVAL_TO_TIMER(zvtimer, timer);

  //попытка получить таймер, созданный когда btp был отключен
  if (timer == dummy_timer) {
    RETURN_FALSE;
  }

  array_init(return_value);
  btp_timer_dump(return_value, timer);
}

//proto bool btp_script_name_set(string script_name, array hosts_ids)
static PHP_FUNCTION(btp_script_name_set)
{
  zend_string *zscript_name;
  zval *hosts_ids;

  switch (EX_NUM_ARGS()) {
    case 3: {
      zend_string *zproject_name;

      ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_STR(zscript_name)
        Z_PARAM_STR(zproject_name)
        Z_PARAM_ZVAL(hosts_ids)
      ZEND_PARSE_PARAMETERS_END_EX(RETURN_FALSE);

      if (BTP_G(project_name)) zend_string_release(BTP_G(project_name));
      BTP_G(project_name) = php_addslashes(zproject_name);
    } break;

    case 2: {
      ZEND_PARSE_PARAMETERS_START(2, 2)
        Z_PARAM_STR(zscript_name)
        Z_PARAM_ZVAL(hosts_ids)
      ZEND_PARSE_PARAMETERS_END_EX(RETURN_FALSE);
    } break;

    default: {
      RETURN_FALSE;
    }
  }

  if (UNEXPECTED(!btp_set_hosts_ids(&BTP_G(globals_hosts_ids), hosts_ids))) {
    RETURN_FALSE;
  }

  if (BTP_G(script_name)) zend_string_release(BTP_G(script_name));
  BTP_G(script_name) = php_addslashes(zscript_name);

  RETURN_TRUE;
}

//proto bool btp_project_name_set(string project_name)
static PHP_FUNCTION(btp_project_name_set)
{
  zend_string *zproject_name;

  ZEND_PARSE_PARAMETERS_START(1, 1)
    Z_PARAM_STR(zproject_name)
  ZEND_PARSE_PARAMETERS_END_EX(RETURN_FALSE);

  if (BTP_G(project_name)) zend_string_release(BTP_G(project_name));
  BTP_G(project_name) = php_addslashes(zproject_name);

  RETURN_TRUE;
}

//proto resource btp_timer_start(string service, string server, string operation, array hosts_ids)
static PHP_FUNCTION(btp_timer_start)
{
  if (UNEXPECTED(!btp_enabled())) {
    GC_ADDREF(dummy_timer->rsrc);
    RETURN_RES(dummy_timer->rsrc);
  }

  zend_string *service, *server, *operation;
  zval *hosts_ids;

  ZEND_PARSE_PARAMETERS_START(4, 4)
    Z_PARAM_STR(service)
    Z_PARAM_STR(server)
    Z_PARAM_STR(operation)
    Z_PARAM_ZVAL(hosts_ids)
  ZEND_PARSE_PARAMETERS_END_EX(RETURN_FALSE);

  btp_timer_t *timer = btp_timer_ctor(service, server, operation, NULL);

  if (UNEXPECTED(!btp_set_hosts_ids(&timer->hosts_ids, hosts_ids))) {
    RETURN_FALSE;
  }

  btp_timer_register_resource(timer);
  btp_timer_start(timer);

  RETURN_RES(timer->rsrc);
}

//proto bool btp_timer_stop(resource timer)
static PHP_FUNCTION(btp_timer_stop)
{
  zval *zvtimer;

  ZEND_PARSE_PARAMETERS_START(1, 1)
    Z_PARAM_RESOURCE(zvtimer)
  ZEND_PARSE_PARAMETERS_END_EX(RETURN_FALSE);

  btp_timer_t *timer;
  BTP_ZVAL_TO_TIMER(zvtimer, timer);

  //попытка остановить таймер, созданный когда btp был отключен
  if (UNEXPECTED(timer == dummy_timer)) {
    RETURN_TRUE;
  }
  if (UNEXPECTED(!timer->started)) {
    php_error_docref(NULL, E_WARNING, "timer is already stopped");
    RETURN_FALSE;
  }

  GC_ADDREF(timer->rsrc);
  btp_timer_stop(timer);
  btp_autoflush();

  RETURN_TRUE;
}

//proto bool btp_timer_set_operation(resource timer, string operation)
static PHP_FUNCTION(btp_timer_set_operation)
{
  zval *zvtimer;
  zend_string *operation;

  ZEND_PARSE_PARAMETERS_START(2, 2)
    Z_PARAM_RESOURCE(zvtimer)
    Z_PARAM_STR(operation)
  ZEND_PARSE_PARAMETERS_END_EX(RETURN_FALSE);

  btp_timer_t *timer;
  BTP_ZVAL_TO_TIMER(zvtimer, timer);

  //попытка остановить таймер, созданный когда btp был отключен
  if (UNEXPECTED(timer == dummy_timer)) {
    RETURN_TRUE;
  }
  if (UNEXPECTED(!timer->started)) {
    php_error_docref(NULL, E_WARNING, "timer is already stopped");
    RETURN_FALSE;
  }

  zend_string_release(timer->operation);
  timer->operation = php_addslashes(operation);

  RETURN_TRUE;
}

// proto bool btp_flush(stopped=true)
static PHP_FUNCTION(btp_flush)
{
  zend_bool stopped = 1;

  ZEND_PARSE_PARAMETERS_START(0, 1)
    Z_PARAM_OPTIONAL
    Z_PARAM_BOOL(stopped)
  ZEND_PARSE_PARAMETERS_END_EX(RETURN_FALSE);

  if (!stopped) btp_timer_stop_all();
  btp_flush_data();

  RETURN_TRUE;
}

// proto btp_timer_count(service, server, operation, time = 0, server_id = 0)
static PHP_FUNCTION(btp_timer_count)
{
  if (UNEXPECTED(!btp_enabled())) RETURN_TRUE;

  zend_string *service, *server, *operation;
  zend_long time_value = 0;
  zval *hosts_ids;

  ZEND_PARSE_PARAMETERS_START(5, 5)
    Z_PARAM_STR(service)
    Z_PARAM_STR(server)
    Z_PARAM_STR(operation)
    Z_PARAM_LONG(time_value)
    Z_PARAM_ZVAL(hosts_ids)
  ZEND_PARSE_PARAMETERS_END_EX(RETURN_FALSE);

  if (UNEXPECTED(time_value < 0)) {
    php_error_docref(NULL, E_WARNING, "btp time value can't be less than 0");
    RETURN_FALSE;
  }

  btp_timer_t *timer = btp_timer_ctor(service, server, operation, NULL);

  if (UNEXPECTED(!btp_set_hosts_ids(&timer->hosts_ids, hosts_ids))) {
    RETURN_FALSE;
  }

  btp_timer_count_and_stop(timer, time_value);
  btp_autoflush();

  RETURN_TRUE;
}

// proto btp_timer_count_script(service, server, operation, script, time = 0, server_id = 0)
static PHP_FUNCTION(btp_timer_count_script)
{
  if (UNEXPECTED(!btp_enabled())) RETURN_TRUE;

  zend_string *service, *server, *operation, *script;
  zend_long time_value = 0;
  zval *hosts_ids;

  ZEND_PARSE_PARAMETERS_START(6, 6)
    Z_PARAM_STR(service)
    Z_PARAM_STR(server)
    Z_PARAM_STR(operation)
    Z_PARAM_STR(script)
    Z_PARAM_LONG(time_value)
    Z_PARAM_ZVAL(hosts_ids)
  ZEND_PARSE_PARAMETERS_END_EX(RETURN_FALSE);

  if (UNEXPECTED(time_value < 0)) {
    php_error_docref(NULL, E_WARNING, "btp time value can't be less than 0");
    RETURN_FALSE;
  }

  btp_timer_t *timer = btp_timer_ctor(service, server, operation, script);

  if (UNEXPECTED(!btp_set_hosts_ids(&timer->hosts_ids, hosts_ids))) {
    RETURN_FALSE;
  }

  btp_timer_count_and_stop(timer, time_value);
  btp_autoflush();

  RETURN_TRUE;
}

//--------------------------------PHP API-------------------------------------------

static void btp_register_constants(INIT_FUNC_ARGS)
{
  REGISTER_LONG_CONSTANT("BTP_FORMAT_V1", BTP_FORMAT_V1, BTP_CONSTANT_FLAGS);
  REGISTER_LONG_CONSTANT("BTP_FORMAT_V2", BTP_FORMAT_V2, BTP_CONSTANT_FLAGS);
}

const zend_function_entry btp_functions[] = {
  PHP_FE(btp_config_server_set, NULL)
  PHP_FE(btp_config_server_pool, NULL)
  PHP_FE(btp_dump, NULL)
  PHP_FE(btp_dump_timer, NULL)
  PHP_FE(btp_script_name_set, NULL)
  PHP_FE(btp_project_name_set, NULL)
  PHP_FE(btp_timer_start, NULL)
  PHP_FE(btp_timer_stop, NULL)
  PHP_FE(btp_flush, NULL)
  PHP_FE(btp_timer_count, NULL)
  PHP_FE(btp_timer_count_script, NULL)
  PHP_FE(btp_timer_set_operation, NULL)
  PHP_FE_END
};

static PHP_INI_MH(OnIniUpdate)
{
  if (strncmp("btp.fpm_enable", ZSTR_VAL(entry->name), ZSTR_LEN(entry->name)) == 0) {
    zend_bool new_fpm_enable = atoi(ZSTR_VAL(new_value));
    if (!BTP_G(is_cli) && BTP_G(fpm_enable) && !new_fpm_enable) {
      btp_on_disable();
    }
    BTP_G(fpm_enable) = new_fpm_enable;
  }
  else if (strncmp("btp.cli_enable", ZSTR_VAL(entry->name), ZSTR_LEN(entry->name)) == 0) {
    zend_bool new_cli_enable = atoi(ZSTR_VAL(new_value));
    if (BTP_G(is_cli) && BTP_G(cli_enable) && !new_cli_enable) {
      btp_on_disable();
    }
    BTP_G(cli_enable) = new_cli_enable;
  }
  else if (strncmp("btp.autoflush_time", ZSTR_VAL(entry->name), ZSTR_LEN(entry->name)) == 0) {
    BTP_G(autoflush_time) = (unsigned)(zend_strtod(ZSTR_VAL(new_value), NULL) * 1000.0);
  }
  else if (strncmp("btp.autoflush_count", ZSTR_VAL(entry->name), ZSTR_LEN(entry->name)) == 0) {
    BTP_G(autoflush_count) = atoi(ZSTR_VAL(new_value));
  }
  else if (strncmp("btp.packet_max_len", ZSTR_VAL(entry->name), ZSTR_LEN(entry->name)) == 0) {
    BTP_G(packet_max_len) = atoi(ZSTR_VAL(new_value));
    if (request_buffer) {
      request_buffer = perealloc(request_buffer, BTP_G(packet_max_len), 1);
    } else {
      request_buffer = pemalloc(BTP_G(packet_max_len), 1);
    }
  }

  return SUCCESS;
}

PHP_INI_BEGIN()
  PHP_INI_ENTRY("btp.cli_enable", "1", PHP_INI_ALL, OnIniUpdate)
  PHP_INI_ENTRY("btp.fpm_enable", "1", PHP_INI_ALL, OnIniUpdate)
  PHP_INI_ENTRY("btp.autoflush_time", "60.0", PHP_INI_ALL, OnIniUpdate)
  PHP_INI_ENTRY("btp.autoflush_count", "0", PHP_INI_ALL, OnIniUpdate)
  PHP_INI_ENTRY("btp.packet_max_len", "65536", PHP_INI_ALL, OnIniUpdate)
PHP_INI_END()

static void btp_init_globals(zend_btp_globals *globals) {
  memset(globals, 0, sizeof(zend_btp_globals));
}

static PHP_MINIT_FUNCTION(btp)
{
  ZEND_INIT_MODULE_GLOBALS(btp, btp_init_globals, NULL);
  REGISTER_INI_ENTRIES();

  btp_register_constants(INIT_FUNC_ARGS_PASSTHRU);
  le_btp_timer = zend_register_list_destructors_ex(btp_timer_resource_dtor, NULL, BTP_RESOURCE_NAME, module_number);

  BTP_G(is_cli) = sapi_module.name && strncmp("cli", sapi_module.name, 3) == 0;

  zend_hash_init(&BTP_G(servers_cache), 0, NULL, btp_server_dtor, 1);
  zend_hash_init(&BTP_G(hosts), 0, NULL, btp_host_dtor, 1);

  globals_module_init();
  gettimeofday(&BTP_G(send_timer_start), 0);

  return SUCCESS;
}

static PHP_MSHUTDOWN_FUNCTION(btp)
{
  globals_module_shutdown();

  zend_hash_destroy(&BTP_G(hosts));
  zend_hash_destroy(&BTP_G(servers_cache));

  UNREGISTER_INI_ENTRIES();
  pefree(request_buffer, 1);

  return SUCCESS;
}

static PHP_RINIT_FUNCTION(btp)
{
#if defined(COMPILE_DL_BTP) && defined(ZTS)
  ZEND_TSRMLS_CACHE_UPDATE();
#endif

  dummy_timer = btp_timer_ctor(NULL, NULL, NULL, NULL);
  btp_timer_register_resource(dummy_timer);

  //инициализация глобальных счетчиков
  globals_request_init();

  BTP_G(script_name) = NULL;
  BTP_G(project_name) = NULL;
  btp_list_reset(&BTP_G(timers_completed));

  return SUCCESS;
}

static PHP_RSHUTDOWN_FUNCTION(btp)
{
  //добавим глобальные счетчики
  globals_request_shutdown();

  //застопим все таймеры и отправим все нах
  btp_timer_stop_all();
  btp_flush_data();

  if (BTP_G(script_name)) {
    zend_string_release(BTP_G(script_name));
  }
  if (BTP_G(project_name)) {
    zend_string_release(BTP_G(project_name));
  }

  zend_hash_clean(&BTP_G(hosts));

  // cleared @ php_request_shutdown() => zend_deactivate()
  //zend_list_delete(dummy_timer->rsrc);

  return SUCCESS;
}

static PHP_MINFO_FUNCTION(btp)
{
  php_info_print_table_start();
  php_info_print_table_header(2, "Btp support", "enabled");
  php_info_print_table_row(2, "Extension version", PHP_BTP_VERSION);
  php_info_print_table_end();

  DISPLAY_INI_ENTRIES();
}

zend_module_entry btp_module_entry = {
  STANDARD_MODULE_HEADER,
  "btp",
  btp_functions,
  PHP_MINIT(btp),
  PHP_MSHUTDOWN(btp),
  PHP_RINIT(btp),
  PHP_RSHUTDOWN(btp),
  PHP_MINFO(btp),
  PHP_BTP_VERSION,
  STANDARD_MODULE_PROPERTIES
};

#ifdef COMPILE_DL_BTP
#ifdef ZTS
ZEND_TSRMLS_CACHE_DEFINE();
#endif
ZEND_GET_MODULE(btp)
#endif

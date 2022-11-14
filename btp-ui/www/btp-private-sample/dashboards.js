
var DashboardsHelpers = {
	makegraph_srv: function(params,items, scale, slice, caption, width, height) {
		var u_params = encodeURI(JSON.stringify( _.extend(params,{scale: scale}) ));
		var u_items = encodeURI(JSON.stringify(items));
		var p_caption = '';
		if (typeof(caption) != 'undefined') {
			p_caption = '&title=' + encodeURI(caption);
		}
        width = width || 530;
        if (!height) {
			height = 250;
			height += Math.ceil(items.length/2)*20;
		}
		return '<img width="'+width+'" height="'+height+'" src="graph.php?params='+u_params+p_caption+'&items='+u_items+'&scale='+scale+'&slice='+slice+'&host='+window.btp.getHost()+'&width='+width+'&height='+height+'&normscale=3"> ';
	},
	makegraph_client: function(params,items,scale, slice, caption,props) {
		var g = new window.btpgraph(0,scale);
		var p;
		btp.multi_query( _.map(items,function(item) {
			return ['get_graph', _.extend({},params,{scale: scale},item)];
		}), function(args__) {
			_.each(arguments, function(res, a) {
				var t = [];
				if (!res.data.length) return;
				for (var i = res.data.length/2; i < res.data.length; i++) {
					t.push(mkscale(res.data[i], res.scale));
				}
				if (slice==="count") {
					g.addCount(t,typeof(caption)=="string"?caption:caption[a]);
				} else {
					g.addTime(t,typeof(caption)=="string"?caption:caption[a]);
				}
			});
			g.setTs(arguments[0].ts);
			g.render(_.extend({css:{width: '530px',height: '250px', display:'inline-block'}},props) );
		});
		return g;
	},
	makegraphlist: function(res, params, key, href) {
		var html = [];
		html.push("<div style='white-space:nowrap;'>");// style='overflow-x: scroll; min-width: 1600px;white-space:nowrap;'>");
		res = res.slice(0,30);
		_.each(res,function(item) {
			var items = {};
			items[key] = item;
			items = [items];
			html.push("<a href='"+href.replace("@@",encodeparam(item))+"'>");
			html.push(DashboardsHelpers.makegraph_srv(params,items, 60, 'perc80', item));
			html.push(DashboardsHelpers.makegraph_srv(params,items, 1800, 'perc80', item));
			html.push(DashboardsHelpers.makegraph_srv(params,items, 21600, 'perc80', item));
			html.push('<br/>');
			html.push(DashboardsHelpers.makegraph_srv(params,items, 60, 'count', item));
			html.push(DashboardsHelpers.makegraph_srv(params,items, 1800, 'count', item));
			html.push(DashboardsHelpers.makegraph_srv(params,items, 21600, 'count', item));
			html.push("</a>");
			html.push('<br/>');
		});
		html.push("</div>");
		return html.join("");
	},
    make_service_one: function(node, service, server, filter_time, filter_count) {
        var node_id = this.join_args(arguments);
        node.append('<div id="'+node_id+'"></div>');

        var self = this;
        var html = [];
        btp.query('get_list', {service: service, server: '', op: '?'}, function(ops) {
            var time_ops = self.format_items(self.filter_by_mask(ops, filter_time), 'op');
            var count_ops = self.format_items(self.filter_by_mask(ops, filter_count), 'op');
            html.push(self.make_server_graph(service, server, count_ops, 'count'));
            html.push(self.make_server_graph(service, server, time_ops, 'perc80'));
            html.push('<br />');

            node.find('#'+node_id).html(html.join(''));
        });
    },
    make_service_list: function(node, service, server, mask) {
        var node_id = this.join_args(arguments);
        node.append('<div id="'+node_id+'"></div>');

        var self = this;
        var html = [];
        btp.query('get_list', {service: service, server: '', op: '?'}, function(ops) {
            ops = self.filter_by_mask(ops, mask);
            _.each(ops, function(op) {
                html.push(self.make_op_graph(service, server, op, 'count'));
                html.push(self.make_op_graph(service, server, op, 'perc80'));
                html.push('<br />');
            });

            node.find('#'+node_id).html(html.join(''));
        });
    },
    make_service_total: function(node, service, filter_time, filter_count, show_graphs_by_server) {
        if (typeof show_graphs_by_server == 'undefined') {
            show_graphs_by_server = true;
        }
        var node_id = this.join_args(arguments);
        node.append('<div id="'+node_id+'"></div>');

        var self = this;
        var html = [];
        btp.query('get_list', {service: service, server: '', op: '?'}, function(ops) {
            var time_ops = self.format_items(self.filter_by_mask(ops, filter_time), 'op');
            var count_ops = self.format_items(self.filter_by_mask(ops, filter_count), 'op');
            html.push(self.make_server_graph(service, '', count_ops, 'count'));
            html.push(self.make_server_graph(service, '', time_ops, 'perc80'));
            html.push('<br />');
            if (show_graphs_by_server) {
                btp.query('get_list', {service: service, server: '?', op: 'all'}, function(servers) {
                    _.each(servers, function(server) {
                        html.push(self.make_server_graph(service, server, count_ops, 'count'));
                        html.push(self.make_server_graph(service, server, time_ops, 'perc80'));
                        html.push('<br />');
                    });
    
                    node.find('#'+node_id).html(html.join(''));
                });
            } else {
                node.find('#'+node_id).html(html.join(''));
            }
        });
    },
    filter_by_mask: function(items, mask) {
        if (mask) {
            if (mask == '-') {
                return [];
            }
            var filters = [];
            _.each(mask.split(','), function(expr, i) {
                var is_match = expr.charAt(0) == '+';
                var regexp = new RegExp(expr.substr(1));
                filters[i] = {is_match: is_match, regexp: regexp};
            });
            items = _.filter(items, function(item) {
                var result = true;
                for (var i = 0; i < filters.length; i++) {
                    var match = item.match(filters[i].regexp);
                    result = result && (filters[i].is_match ? match : !match);
                }
                return result;
            });
        }
        return items;
    },
    format_items: function(list, key) {
        var items = [];
        _.each(list, function(item) {
            var obj = {};
            obj[key] = item;
            items.push(obj);
        });
        return items;
    },
    make_server_graph: function(service, server, items, slice) {
        if (!items.length) {
            return '';
        }
        var html = [];
        html.push('<a href="#service/'+service+'/'+(server ? server+'/' : '')+'">');
        
        var caption = service;
        if (server != service) {
            caption += ' - '+(server ? server : 'all');
        }
        caption += ' - '+(slice != 'count' ? 'time' : 'count' );
        
        html.push(DashboardsHelpers.makegraph_srv({service: service, server: server}, items, App.scale, slice, caption));
        html.push('</a>');
        return html.join('');
    },
    make_op_graph: function(service, server, op, slice) {
        var html = [];
        html.push('<a href="#service/'+service+'/'+op+'">');
        
        var caption = service;
        if (server != service) {
            caption += ' - '+(server ? server : 'all');
        }
        caption += ' - '+op+' - '+(slice != 'count' ? 'time' : 'count' );
        
        var items = [{op: op}];
        html.push(DashboardsHelpers.makegraph_srv({service: service, server: server}, items, App.scale, slice, caption));
        html.push('</a>');
        return html.join('');
    },
    join_args: function(args, glue) {
        glue = glue || '-';
        args = [].slice.call(args, 1);
        var str = args.join(glue);
        str = str.replace(/[,+.]/g, '');
        return str;
    }
};

var Dashboards = {
	getList: function() {
		return [
			{name: "топ php - frontend - cnt", val: "php_top_front_cnt"}
			,{name: "топ php - frontend - total", val: "php_top_front_total"}
			,{name: "топ php - frontend - time", val: "php_top_front_time"}
			,{name: "топ php - script", val: "php_top_script"}
			,{name: "топ сервисы", val: "top_service"}
			,{name: "email - UK", val: "email_uk"}
			,{name: "email - Mamba", val: "email_mamba"}
			,{name: "daemons", val: "deamons"}
			,{name: "mysql", val: "mysql"}
			,{name: "аналитика", val: "analytics"}
			,{name: "external requests", val: "ext_requests"}
			,{name: "gearman", val: "gearman"}
			,{name: "Photo storage", val: "photostorage"}
		];
	},

	php_top_front_cnt: function(node) {
		var params = {service: 'SCRIPT_wwwnew', op: 'all'};
		btp.query('get_list_advanced', _.extend(params,{script:'?', sort_by: 'count', limit: 10}), function(res) {
			var html = DashboardsHelpers.makegraphlist(res, params, 'script', "#script/@@/SCRIPT_wwwnew/");
			node.html(html);
		});
	},
	php_top_front_total: function(node) {
		var params = {service: 'SCRIPT_wwwnew', op: 'all'};
		btp.query('get_list_advanced', _.extend(params,{script:'?', sort_by: 'total', limit: 10}), function(res) {
			var html = DashboardsHelpers.makegraphlist(res, params, 'script', "#script/@@/SCRIPT_wwwnew/");
			node.html(html);
		});
	},
	php_top_front_time: function(node) {
		var params = {service: 'SCRIPT_wwwnew', op: 'all'};
		btp.query('get_list_advanced', _.extend(params,{script:'?', sort_by: 'perc80', limit: 10}), function(res) {
			var html = DashboardsHelpers.makegraphlist(res, params, 'script', "#script/@@/SCRIPT_wwwnew/");
			node.html(html);
		});
	},
	php_top_script: function(node) {
		var params = {service: 'SCRIPT_wscript', op: 'all'};
		btp.query('get_list_advanced', _.extend(params,{script:'?', sort_by: 'total', limit: 10}), function(res) {
			var html = DashboardsHelpers.makegraphlist(res, params, 'script', "#script/@@/SCRIPT_wscript/");
			node.html(html);
		});
	},
	top_service: function(node) {
		var params = {service: '?'};
		btp.query('get_list_advanced', _.extend(params,{limit: 30, sort_by: 'count'}), function(res) {
			var html = DashboardsHelpers.makegraphlist(res, params, 'service', "#service/@@//");
			node.html(html);
		});
	},

	email_x: function(service, node) {
		node.html("<div class='c1'></div><div class='c2'></div><div class='c3'></div>");
		var shown = {};
		var with_params = function(node, params, cb) {
			btp.query('get_list_advanced', _.extend(params,{server: '?', limit: 4, sort_by: 'count'}), function(res) {
				var href="#service/"+service+"/@@/";
				var html = [];
				html.push("<div style='white-space:nowrap;'>");// style='overflow-x: scroll; min-width: 1600px;white-space:nowrap;'>");
				var width = $('#content-right').width()/2-30;
				_.each(res,function(item) {
					if (shown[item]) return; else shown[item] = 1;

					var items = [{server: item}];
					var p = {service: params.service, server: item};
					html.push("<a href='"+href.replace("@@",encodeparam(item))+"'>" + item + "</a><br>");
					////stackedGraph
					var g1 = DashboardsHelpers.makegraph_client(
						p,
						[{op: 'bounced'},{op: 'sent'},{op: 'deferred'}],
						App.scale,
						'count',
						['bounced', 'sent','deferred']
						, {
							css: {width: width,height: '300px', display:'inline-block'}
						}
					);
					var g2 = DashboardsHelpers.makegraph_client(
						p,
						[{op: 'bounced'},{op: 'sent'},{op: 'deferred'}],
						App.scale,
						'count',
						['bounced', 'sent','deferred']
						, {
							css: {width: width,height: '300px', display:'inline-block'}
							,props: {stackedGraph: true}
							,normalize:true
						}
					);
					html.push(g1.createNode());
					html.push(g2.createNode());
					g1.setPair(g2);
					g2.setPair(g1);
					
					//html.push("</a>");
					html.push('<br/>');
				});
				html.push("</div>");		
				html = html.join("");

				node.html('<h1>'+params.service+' - sort by ' + params.op + '</h1>').append(html);
				
				(cb||function(){})();
			});
		};
		with_params(node.find('.c1'), {service: service,op: 'bounced'},function() {
			with_params(node.find('.c2'), {service: service,op: 'deferred'}, function() {
				with_params(node.find('.c3'), {service: service,op: 'sent'});
			});
		});
	},
	email_uk: function(node) { this.email_x('email-uk',node);},
	email_mamba: function(node) { this.email_x('email-mamba',node);},
    
    deamons: function(node) {
        DashboardsHelpers.make_service_total(node, 'main');
        DashboardsHelpers.make_service_one(node, 'authorizer', 'authorizer1');
        DashboardsHelpers.make_service_total(node, 'comet');
        DashboardsHelpers.make_service_total(node, 'tt');
        DashboardsHelpers.make_service_one(node, 'kyototycoon_kyoto_main', 'kyototycoon_kyoto_main', '+send_request', '+send_request');
        DashboardsHelpers.make_service_one(node, 'kyototycoon_kyoto_main', 'kyototycoon_kyoto_main', '-send_request,-error', '-send_request');
        DashboardsHelpers.make_service_total(node, 'search', '-error');
        DashboardsHelpers.make_service_one(node, 'search_coords', 'search_coords.json_tcp', '-error');
        DashboardsHelpers.make_service_total(node, 'hitlist_typed', '-error');
        DashboardsHelpers.make_service_one(node, 'laccess', 'laccess.json_tcp', '-error');
        DashboardsHelpers.make_service_one(node, 'laccess', 'laccess.json_udp', '-error,-list_by_mode');
        DashboardsHelpers.make_service_one(node, 'mamba_photoline_php', 'mamba_photoline_php');
        DashboardsHelpers.make_service_total(node, 'leader');
        DashboardsHelpers.make_service_one(node, 'hitlist_rev_new', 'hitlist_rev_new_udp');
        DashboardsHelpers.make_service_one(node, 'travel', 'travel_tcp');
        DashboardsHelpers.make_service_total(node, 'banner');
        DashboardsHelpers.make_service_one(node, 'mamba_ratingVS', 'mamba_ratingVS_tcp', '-error');
        DashboardsHelpers.make_service_one(node, 'olympus_m', 'olympus_m');
        DashboardsHelpers.make_service_one(node, 'mnotify', 'mnotify_tcp');
        DashboardsHelpers.make_service_one(node, 'sphinx-interests', 'sphinx-interests');
    },
    
    mysql: function(node) {
        DashboardsHelpers.make_service_one(node, 'dbrusnew', 'dbrusnew');
        DashboardsHelpers.make_service_one(node, 'db', 'db2');
        DashboardsHelpers.make_service_one(node, 'db', 'db3');
        DashboardsHelpers.make_service_one(node, 'dbf', 'dbf3');
        DashboardsHelpers.make_service_one(node, 'partner', 'partner2');
        DashboardsHelpers.make_service_total(node, 'dbslave', '', '', false);
        DashboardsHelpers.make_service_total(node, 'dbs', '', '', false);
    },
    
    analytics: function(node) {
        DashboardsHelpers.make_service_one(node, 'web_upload_albumtype', 'web_upload_albumtype', '-');
        DashboardsHelpers.make_service_one(node, 'web_search', 'web_search', '-');
        DashboardsHelpers.make_service_one(node, 'web_anketa_hits', 'web_anketa_hits', '-');
        DashboardsHelpers.make_service_one(node, 'messenger_send', 'messenger_send', '-failed', '-failed');
        DashboardsHelpers.make_service_one(node, 'messenger_send', 'messenger_send', '+failed', '+failed');
        DashboardsHelpers.make_service_one(node, 'auth_analytics', 'auth_analytics', '-');
    },

    ext_requests: function(node) {
        DashboardsHelpers.make_service_one(node, 'external_api', 'external_api');
        DashboardsHelpers.make_service_one(node, 'MailRuSlot_Menu', 'MailRuSlot_Menu', '-error');
        DashboardsHelpers.make_service_one(node, 'CrossAuthNew_Auth_Driver_Mailru', 'CrossAuthNew_Auth_Driver_Mailru', '-error');
        DashboardsHelpers.make_service_one(node, 'CrossAuthNew_Auth_Driver_Rambler', 'CrossAuthNew_Auth_Driver_Rambler', '-error');
        DashboardsHelpers.make_service_one(node, 'CrossAuthNew_Auth_Driver_Ukr', 'CrossAuthNew_Auth_Driver_Ukr', '-error');
    },
    
    gearman: function(node) {
        DashboardsHelpers.make_service_total(node, 'gearman', '-err');
        DashboardsHelpers.make_service_total(node, 'gearman_stat', '', '-');
        DashboardsHelpers.make_service_total(node, 'gearman_worker', '-gearman_servers');
    },

    photostorage: function(node) {
        DashboardsHelpers.make_service_one(node, 'cropSquare', 'photostorage0');
        DashboardsHelpers.make_service_one(node, 'cropSquare', 'photostorage1');
        DashboardsHelpers.make_service_one(node, 'cropSquare', 'photostorage2');
        DashboardsHelpers.make_service_one(node, 'cropSquare', 'photostorage3');
        DashboardsHelpers.make_service_one(node, 'cropSquare', 'photostorage4');
        DashboardsHelpers.make_service_one(node, 'cropSquare', 'photostorage5');
    },
    
	dummy: null
};

/* ToDoDo можно ли закешировать $loader один раз, чтобы к нему не стучать постоянно */
window.btp = {
	host: '127.0.0.1',
	loader: 0,
	_loader_inc: function () {
		this.loader++;
		if (this.loader == 1) {
			setTimeout(function () {
				if (window.btp.loader > 0) {
					$('#loader').modal('show');
				}
			}, 1);
		}
	},
	_loader_dec: function () {
		this.loader--;
		if (this.loader === 0) {
			$('#loader').modal('hide');
		}
	},
	prepareParamsV2: function(method, params, reqParams) {
		var methodMap = {
			'get_list': 'get_name_tree',
			'get_graph': 'get',
			'get_multigraph': 'multi_get'
		}, ntype = 'branch';
        reqParams.scale = App.scale;
		reqParams.method = methodMap[method];
		var prefix = '', suffix = '', separator = '~~';
		if ('service' === App._category) {
			prefix = 'service';
			if (params['names'] && params['service']) {
				for(var n = 0; n < params['names'].length; n++) {
					params['names'][n] = prefix + separator + params['service'] + separator + (params['server'] && params['server'] != '?' ? params['server'] + separator : '') + params['names'][n];
				}
			} else {
				if (method === 'get_list' && params['script'] === '?') {
					reqParams.method = 'get_names';
					prefix = 'script';
					suffix = params['service'] + separator + params['op'];
				}
				if (!suffix) {
					if (params['service'] && params['service'] !== '?') {
						prefix += separator + (params['service'] !== '[[EMPTY]]' ? params['service'] : '');
					}
					if (method === 'get_list' && !params['op'] && params['server'] === '') {
						reqParams.method = 'get_names';
						prefix += separator + '.*';
					} else {
						if (params['server'] && params['server'] !== '?') {
							prefix += separator + params['server'];
						}
						if (params['op']) {
							if (params['op'] === '?') {
								ntype = 'leaf';
							} else {
								prefix += separator + (params['op'] === '*' ? '.*' : params['op']);
							}
						}
					}
				}
			}
		} else if ('script' === App._category) {
			prefix = 'script';
			if (params['names'] && params['script']) {
				for(var s = 0; s < params['names'].length; s++) {
					params['names'][s] = prefix + separator + params['script'] + separator + (params['service'] && params['service'] != '?' ? params['service'] + separator : '') + params['names'][s];
				}
			}
			if (params['script'] && params['script'] !== '?') {
				prefix += separator + params['script'];
			}
			if (params['service'] && params['service'] !== '?') {
				prefix += separator + params['service'];
			}
			if (params['op']) {
				if (params['op'] === '?') {
					ntype = 'leaf';
				} else if(params['op'] !== '*') {
					prefix += separator + params['op'];
				}
			}
		} else if ('dashboard' === App._category) {
			prefix = true;
		}
		if (!prefix) {
			return false;
		}
		if (reqParams.method === 'get') {
			reqParams.params = JSON.stringify({
				name: prefix + (params['op'] && params['op'] !== '?' ? '' : '.*'),
				sep: separator,
				ts: 0,
				offset: 0,
				limit: 3e3
			});
		} else if (reqParams.method === 'multi_get') {
			if (params['names'] && params['names'].length) {
				reqParams.params = JSON.stringify({
					names: _.map(params['names'], function(nm) {return nm.replace(/\[\[EMPTY\]\]/g, '');}),
					sep: separator,
					ts: 0,
					offset: 0,
					limit: 3e3,
                    power: params['power'] || false
				});
			} else {
				return false;
			}
		} else if (reqParams.method === 'get_names') {
			reqParams.params = JSON.stringify({
				prefix: prefix + separator,
				suffix: separator + suffix,
				sep: separator,
				offset: 0,
				limit: params['limit'] || 1e5,
				sortby: (params['sortby'] != null ? params['sortby'] : 'count'),
                power: params['power'] || false
			});
		} else if (reqParams.method === 'get_name_tree') {
			reqParams.params = JSON.stringify({
				prefix: prefix, //+ (params['op'] && params['op'] !== '?' ? '' : '.*'),
				depth: 1,
				sep: separator,
				ntype: ntype,
				offset: 0,
				limit: params['limit'] || 1e5,
				sortby: (params['sortby'] != null ? params['sortby'] : 'count'),
				power: params['power'] || false
			});
		} else {
			reqParams.method = method;
			reqParams.params = JSON.stringify(params);
		}
		return true;
	},
	query: function (method, params, cb) {
		var dfd = $.Deferred();
		if (method) {
			//console.log({host: window.btp.host, method: method, params: JSON.stringify(params)});
			var reqParams = {
				cluster: window.btp.cluster
			};
			if (App.isAPIv2) {
				if (!window.btp.prepareParamsV2(method, params, reqParams)) {
					return dfd.reject();
				}
				var cache;
				if (method === 'get_list' && '?' === _.property(App._category)(params)) {
					cache = this.getListFromCache(App._category);
					if (cache) {
						dfd.resolve(cache);
						cb && cb(cache);
						return dfd;
					}
				}
			} else {
				reqParams.method = method;
				reqParams.params = JSON.stringify(params);
			}
			if (reqParams.method) {
				window.btp._loader_inc();
                //console.log(reqParams);
				window.$.post('js.php', reqParams, 'json')
					.done(function (data) {
						if (!data) {
							dfd.reject(); // silent error
						} else if (!data || _.isString(data)) {
							onError('no data', 'пустой ответ сервера', reqParams, data);
							dfd.reject();
						} else {
							dfd.resolve(data);
							if (method === 'get_list' && '?' === _.property(App._category)(params)) {
								window.btp.setListToCache(App._category, data);
							}
						}
						cb && cb(data);
					})
					.error(function (xhr, status, msg) {
						onError(status, msg, reqParams);
						dfd.reject();
					})
					.always(function () {
						window.btp._loader_dec();
					});
			}
		} else {
			cb && cb(params);
			dfd.resolve(false);
		}

		function onError(status, msg, reqParams, res)
		{
			window.btp.onError({title: 'Ошибка получения данных с сервера',status: status, msg: msg, reqParams: JSON.stringify(reqParams)}, res);
		}
		return dfd.promise();
	},
	isLocalStorageAvailable: function () {
		try {
			return 'localStorage' in window && window['localStorage'] !== null;
		} catch (e) {
			return false;
		}
	},
	clearCache: function() {
		if (!this.isLocalStorageAvailable()) return false;
		localStorage['service'.concat('_', btp.getHost())] = null;
		localStorage['script'.concat('_', btp.getHost())] = null;
	},
	getListFromCache: function(key) {
		if (!this.isLocalStorageAvailable()) return false;
		key = key.concat('_', btp.getHost());
		try {
			var ts = _.now() - (+localStorage[key.concat('_timestamp')] || 0);
			return ts < App._cacheAlive ? JSON.parse(localStorage[key]) : null;
		} catch(ex) {
			return null;
		}
	},
	setListToCache: function(key, value) {
		if (!this.isLocalStorageAvailable()) return false;
		key = key.concat('_', btp.getHost());
		try {
			localStorage[key] = JSON.stringify(value);
			localStorage[key.concat('_timestamp')] = _.now();
			return true;
		} catch(ex) {
			return false;
		}
	},
	onError: function(templateParams, res) {
		var $err = $('ul li a.js-errors'),
			$cnt = $err.find('b');
		$cnt.text(+$cnt.text()+1);
		$err.parent().removeClass('empty');
		if (_.isString(res)) {
			$('#content-right').html(res);
		} else {
			window.btp.show('alert', templateParams).done(function(content) {
				$(content).alert().appendTo($('#errorList .js-error-list'));
			});
		}
	},
	multi_query: function (data, cb) {
		var prl = new Paralleler();//btp.parallel
		_.each(data, function (item) {
			prl.add_bind_obj(btp, btp.query, item);
		});
		prl.onfinish(cb);
	},
	tpls: {},
	show: function (template_name, data, el) {
		var $el = el && $(el),
			dfd = $.Deferred();
		data = data || {};
		var tpl = btp.tpls[template_name],
			tpld;
		if (!tpl) {tpl = btp.tpls[template_name] = $("#" + template_name + "_tpl").html();}
		if (!tpl) {throw template_name;}
		// if too much data - load it by chunks
		if (data && data.r && _.isArray(data.r) && data.r.length > 300) {
			var _data = _.extend({}, data),
				allItems = _data.r.slice(0, _data.r.length),
				initialLength = allItems.length,
				spliceBy = 150;

            if ($el) {
                $el.empty();
            }

			function appendByChunks()
			{
				"use strict";
				setTimeout(function () {
					_data.r = allItems.splice(0, spliceBy);
					tpld = _.template(tpl, _data);
					if ($el) {
						$el.append(tpld);
					}
					$(document).trigger('loader.progress', {progress: allItems.length / initialLength});
					if (allItems.length > 0) {
						appendByChunks();
					} else {
						$(document).trigger('loader.finished');
						if ($el) {
							dfd.resolve($el);
						} else {
							dfd.resolve($(tpld));
						}
					}
				}, 20);
			}
			appendByChunks();
		}
		else
		{
            if (data.msg) {
                data.msg = data.msg.replace(/(<[\s\S]*(.*?)>)/ig, '');
            }
			tpld = _.template(tpl, _.extend({title:'',status:'',msg:'',reqParams:''}, data));
			if ($el) {
				$el.html(tpld);
				dfd.resolve($el);
			} else {
				dfd.resolve($(tpld));
			}
		}
		return dfd.promise();
	},
	query_show: function (template_name, method, params, callback) {
		window.btp.query(method, params, function (data) {
			var tpl_res = window.btp.show(template_name, data);
			callback(tpl_res, data);
		});
	},
	parallel: new Paralleler(),
	renderBlock: function (data, render, end) {

		var l = data.length,
			i = 0,
			step = 1,
			count = 100;

		function r(render, end) {
			var limit = Math.min(step * count, l);
			for (; i < limit; i++) {
				typeof render === 'function' && render(i);
			}
			if (step * count < l) {
				step++;
				setTimeout(function () {
					r(render, end);
				}, 4);
			} else {
				typeof end === 'function' && end();
			}
		}

		r(render, end);

	},
	/**
	 * 
	 * @param [sHost]
	 */
	getHost: function(sHost) {
		var res = sHost || window.btp.cluster + ':' + App.scale;
		return res;
	}
};

function str_replace(from, to, str) {
	return str.split(from).join(to);
}

function encodeparam(p) {
	return encodeURI(p).split("/").join("*");
}

function decodeparam(p) {
	return p.split("*").join("/");
}

/*function getLink() {
 var s = "#";
 for (var i=0;i<arguments.length;i++) {
 s += encodeparam(arguments[i]) + "/";
 }
 return s;
 }*/

function getLink() {
	var s = "#", i;
	var p = App.getLinkParams();
	for (i = 0; i < arguments.length; i++) {
		var argument = arguments[i];
		if (typeof(argument) === 'object' && ~String(argument).indexOf('~~')) {
			p = _.extend(p, argument);
		} else {
			s += encodeparam(argument) + "/";
		}
	}
	i = 0;
	_.each(p, function (v, k) {
		s += (i === 0 ? "?" : "&") + k + "=" + encodeparam(v);
		i++;
	});
	//console.log([arguments,s]);
	return s;
}

function parse_names_from_path(data, pos) {
	if (_.isArray(data) || (!data.branches && !data.names_ts)) {
		return data;
	} else if (_.isArray(data.branches)) {
		var res = _.filter(data.branches, function(b){return !/(^~~)|(\[\[EMPTY\]\])/.test(b);});
		if (res.length !== data.branches.length) {
			res.unshift('[[EMPTY]]');
		}
		return res;
	} else {
		pos = pos || 1;
		return _.compact(_.uniq(_.map(data.names_ts || [], function(ns) { return ns.name.split('~~')[pos]; })));
	}
}

function transform_list(type, data, warnings) {

	//console.log(arguments);
	//console.time('transform_list_inside');

	var res_single = [],
		res_group = {},
		res = [];

	// Если это новый сервер
	if (App.isAPIv2) {
		data = parse_names_from_path(data, 1);
	}

	var conf = App.groupConfig[type];

	data = data || [];

	var rconf = _.map(conf, function (confitem, order) {
		confitem.items = _.map(confitem.items, function (x) {
			return new RegExp(x);
		});
		return confitem;
	});

	_.each(conf, function (x) {
		res_group[x.title] = [];
	});

	var i,
		dataLength = data.length;

	//console.log('dataLength', dataLength);
	//console.time('dataLength');
	for (i = 0; i < dataLength; i++) {
		var dataI = data[i];
		if (dataI !== "") {
			var item = {
				name: dataI,
				val: dataI,
				warning: false,
				items: null
			};

			var z;
			if (warnings && warnings.length) {
				for (z = 0; z < warnings.length; z++) {
					if (warnings[z] === item.val) {
						item.warning = true;
						break;
					}
				}
			}

			var group = 0, z, j;
			rconfc:
				for (z = 0; z < rconf.length; z++) {
					if (rconf[z] && rconf[z].items) {
						for (j = 0; j < rconf[z].items.length; j++) {
							if (rconf[z].items[j] && rconf[z].items[j].test(item.val)) {
								group = rconf[z];
								break rconfc;
							}
						}
					}
				}

			if (group) {
				if (group.replace && item.name) {
					item.name = item.name.split(group.replace).join('');
				}
				res_group[group.title].push(item);
			} else {
				res_single.push(item);
			}
		}
	}
	//console.timeEnd('dataLength');

	_.map(res_group, function (items, key) {
		if (items.length) {

			items.sort(function (a, b) {
				var c = typeof a === 'string' ? a.name.toLocaleLowerCase() : a.name;
				var d = typeof b === 'string' ? b.name.toLocaleLowerCase() : b.name;
				if (c < d) {
					return -1;
				} else if (c > d) {
					return 1;
				}
				return 0;
			});

			res.push({
				name: key,
				items: items,
				warning: _.find(items, function (i) { return item.warning; }) ? true : false
			});
		}
	});

	res.sort(function (a, b) {
		var c = (a.name + '').toLocaleLowerCase();
		var d = (b.name + '').toLocaleLowerCase();
		if (c < d) {
			return -1;
		} else if (c > d) {
			return 1;
		}
		return 0;
	});

	res_single.sort(function (a, b) {
		var c = (a.name + '').toLocaleLowerCase();
		var d = (b.name + '').toLocaleLowerCase();
		if (c < d) {
			return -1;
		} else if (c > d) {
			return 1;
		}
		return 0;
	});

	_.map(res_single, function (item) {
		res.push(item);
	});

	//console.timeEnd('transform_list_inside');
	//console.log(res);

	return res;
}

var App = window.App || {};
App.loading = false;
App.scale = 5;
App.current_width = 800;
App.PLOT_HISTORY = 3e3;

App.set = function (val, type) {
	var activeClass = 'active';
    window.location.hash = window.location.hash.replace(/(%3C([^]+)%3E)/ig, '');
	if (type === 'Scale') {
		if (App.scale !== +val && window.location.hash.indexOf("scale=" + App.scale) >= 0) {
            var newHash = window.location.hash.replace("scale=" + App.scale, "scale=" + val);
            window.location.hash = newHash;
            App.Updaters.left_empty();
			App.Updaters.right_empty();
		}
		App.scale = +val;
	}
	if (type === 'HostGroup') {
        var cluster = val || App.hostConfig.cluster.default;
		if (window.location.hash.indexOf("cluster=" + window.btp.cluster) >= 0) {
			window.location.hash = window.location.hash.replace("cluster=" + window.btp.cluster, "cluster=" + cluster);
			App.Updaters.left_empty();
			App.Updaters.right_empty();
		}
        window.btp.cluster =  cluster;
	}
	if (type === 'Graph') {
		App.newGraph = val === 'flot';
		if (btp.isLocalStorageAvailable()) {
			localStorage['Graph'] = val;
		}
	}
	App.saveCookie();
    
	App.isAPIv2 = true; // Всегда APIv2

	var $jsScaleSelector = $('.js-selector').filter('[data-type="' + type + '"]');
    if (type === 'HostGroup') {
        $('.js-selector').filter('[data-type=Scale]').find('li a').each(function () {
            var $el = $(this);
            var time = $el.data('value');
            if (~~App.hostConfig.scale.types.indexOf(time)) {
                $el.show();
            } else {
                $el.hide();
            }
        });
    }

	$jsScaleSelector.find('li.' + activeClass).removeClass(activeClass);
	var $newActiveLink = $jsScaleSelector.find('a[data-value="' + (type == 'Scale' ? App.scale : type == 'HostGroup' ? window.btp.cluster : type == 'Graph' ? val : '') + '"]');
	$newActiveLink.parent().addClass(activeClass);
	$jsScaleSelector.find('a.dropdown-toggle span').text($newActiveLink.text());
};

App.saveCookie = function () {
	document.cookie = "JCB{cluster=" + window.btp.cluster + "&scale=" + App.scale + "}JCE";
};

App.getLinkParams = function () {
	return {
		cluster: window.btp.cluster,
		scale: App.scale
	};
};

App._parse_url_hlp = function (str) {
	var p = (str || '').split("?");
	var path = _.map(p[0].split("/"), decodeparam);
	//if (path[path.length-1]=="") path = path.slice(0,path.length-1);
	return {
		args: getJsonFromUrl(p[1] || ""),
		path: path,
		length: path.length - 1
	};
};

App.parse_url = function (str) {
	var p = App._parse_url_hlp(str || '');
    if (p.args.scale) {
		App.set(p.args.scale, 'Scale');
    }
    if (p.args.cluster) {
        App.set(p.args.cluster, 'HostGroup');
    }
	return p;
};
App._registerPlot = function(p) {
	if (!App._plots) {
		App._plots = {};
		$(window).on('resize', _.throttle(function() {
//			App.showPlotTooltip(null);
			// TODO: don't do it after vertical.
			App.applyOnPlots('doResize');
		}, 250));
	}
	if (App._plots[p.pType]) {
		App._plots[p.pType].destroy();
		delete App._plots[p.pType];
	}
	App._plots[p.pType] = p.plot;
};
App.applyOnPlots = function(method) {
	var plot, i, plots = App._plots, args = [].slice.call(arguments, 1);
	for (i in plots) {
		if (!plots.hasOwnProperty(i)) continue;
		plot = plots[i];
		try {
			if (plot[method]) plot[method].apply(plot, args);
		} catch(ex) {
			delete plots[i];
		}
	}
};

App._createPlot = function(p) {
	var plot, markup = [];
	if (p) {
		if (p.pType === 2) {
			p.currentType = 'perc80';
			p.addLegend = false; // !!!
		} else {
			p.currentType = 'rate';
		}
		markup.push('<div class="plothandler">');
		markup.push('<div class="plotcanvas"></div>');
		markup.push('<div class="plotoptions">');
		markup.push('<div class="btn-group select-graph hide"><button class="btn btn-small dropdown-toggle" data-toggle="dropdown"><span class="value js-selected"></span><span class="caret"></span></button><ul class="dropdown-menu"></ul></div>')
		markup.push('</div>');
		markup.push('<div class="plotlegend"></div>');
		markup.push('<div class="plotpopup plotpopupY"><b>&nbsp;</b><span></span></div>');
		markup.push('<div class="plotpopup plotpopupX"></div>');
		markup.push('</div>');
		p.$el = $(markup.join('')).appendTo(p.el);
		plot = p.plot = $.plot(p.$el.find('.plotcanvas'), getRealPlotData(), App.getPlotOptions(p.pType));
		plotAccordingToChoices();
		if (p.addLegend !== false) {
			(function() {
				var $legend = p.$el.find('.plotlegend');
				var srs = plot.getData(), tmp = [];
				tmp.push('<div class="nav nav-pills">');
				for (var i = 0, s; i < srs.length;i++) {
					s = srs[i];

					tmp.push('<label class="legendLabel');
					tmp.push(s.skip ? ' unchecked"' : '"');
					tmp.push('><span class="badge" style="background-color: ' + s.color + ';"></span>');
					tmp.push('<input type="checkbox" name="name');
					tmp.push(s.id || s.label);
					tmp.push('" id="id');
					tmp.push(s.id || s.label);
					tmp.push(s.skip ? '"' : '" checked');
					tmp.push('><span>');
					tmp.push(s.label);
					tmp.push('</span></label>');
					//('<label' + () + {{series_id}}"' + (series.skip ? '' : 'checked="checked" ') + 'id="id{{series_id}}"><span>{{label}}</span> = <b>0.00</b></label>').replace(/{{series_id}}/g, series.id || label).replace(/{{label}}/g, label)
				}
				tmp.push('<button class="btn btn-small toggle-all hide js-toggle-checked"><span class="icon-eye-close"></span> <b>Скрыть все</b></button>');
				tmp.push('</div>');
				$legend.html(tmp.join(''));
			}());
		}
		function getRealPlotData() {
			var data = [], hideAll = false, pdata = p.data, fv = {}, filter = p.filter;
			for (var i = 0, pd, el, idl, lid; i < pdata.length; i++) {
				pd = pdata[i];
				idl = (pd.id || pd.label);
				lid = (pd.label || pd.id);
				if (p.pType === 1 && lid === 'count') {
					idl = lid = 'rate';
				}
				if (!filter) el = p.$el.find('#id'+idl);
				if (!filter ? (p.addLegend === false || el.prop('checked') || (!el.get(0) && !pd.skip)) : !(lid in filter)) {
					delete pd.skip;
					if (p.pType === 1) {
						if (pd.label === 'count' || pd.label === 'rate' ? p.currentType === pd.label : true) {
							data.push(_.extend({},pd,{data:pd.data}));
						}
					} else if (p.currentType) {
						data.push(_.extend({},pd,{data:pd.data[p.currentType]}));
					}
					el && el.parent().removeClass('unchecked');
					hideAll = true;
				} else {
					// to show legend
					data.push(_.extend({},pd,{data:[], skip: true}));
					el && el.parent().addClass('unchecked');
					fv[(pd.label || pd.id)] = null;
				}
			}
			if (p.pType === 3) {
				App.applyOnPlots('plotAccordingToChoices', fv);
			}
			toggleTogglerState(hideAll);
			return data;
		}
		function plotAccordingToChoices(filter) {
			if (filter) p.filter = filter;
			plot.setData(getRealPlotData());
			fitYAxes();
			plot.setupGrid();
			plot.draw();
			plot.clearCrosshair();
//			App.showPlotTooltip(null);
		}
		function setZoom(event, ranges) {
			var zoomed = false;
			var minTick = App.getPlotScale() * 1000;
			$.each(plot.getXAxes(), function(x, axis) {
				var opts = axis.options;
				if (ranges) {
					if (Math.floor(ranges.xaxis.to) - Math.floor(ranges.xaxis.from) > minTick) {
						opts.min = ranges.xaxis.from;
						opts.max = ranges.xaxis.to;
						zoomed = true;
					}
				} else {
					opts.min = Date.now() - ((App.getPlotScale()*1e3) * App.PLOT_HISTORY);
					opts.max = Date.now();
					zoomed = true;
				}
			});
			if (zoomed) {
				fitYAxes();
				plot.setupGrid();
				plot.draw();
				if (!event.isTrigger || event.isTrigger > 2) {
					plot.getPlaceholder().triggerHandler('zoomed', ranges);
				}
			}
			plot.clearSelection();
			plot.clearCrosshair();
		}
		function fitYAxes() {
			var ps = plot.getData(), xopts = plot.getXAxes()[0].options;
			$.each(plot.getYAxes(), function(y, axis) {
				var opts = axis.options;
				opts.max = opts.min = 0;
				$.each(ps, function(n, series) {
					if (axis.n !== series.yaxis.n || series.skip) {
						return;
					}
					for (var i = 0, p; i < series.data.length; i++) {
						p = series.data[i];
						if (p[0] < xopts.min) continue;
						if (p[0] > xopts.max) break;
						opts.max = Math.max(p[1], opts.max||0);
					}
				});
				opts.max += (opts.max/100)*5;
			});
		}
		function updateLegend(e, pos, item) {
			var axes = plot.getAxes();
			if (!pos ||
				pos.x < axes.xaxis.min || pos.x > axes.xaxis.max) {
				return;
			}
			var i, j, x = 0, dataset = plot.getData();
			var setX = function(val) {
				if (Math.abs(pos.x - val) < Math.abs(pos.x - x)) {
					x = val;
				}
			};
			for (i = 0; i < dataset.length; ++i) {
				var series = dataset[i], dx1 = 0, dx2 = 0, n, nx, y = 0, curr, next;
				for (j = 0; j < series.data.length; ++j) {
					curr = series.data[j];
					if (curr === null) continue;
					nx = j + 1;
					if (series.data[nx] === null) {
						nx = j + 2;
					}
					next = series.data[nx];
					if (next && curr[0] < pos.x && pos.x < next[0]) {
						dx1 = pos.x - curr[0];
						dx2 = next[0] - pos.x;
						n = dx1 < dx2 ? j : nx;
						y = series.data[n][1];
						setX(series.data[n][0]);
						break;
					} else if (!next || (pos.x < curr[0])){
						y = curr[1];
						setX(curr[0]);
						break;
					}
				}
			}
			plot.lockCrosshair({x: x});
			var ttx = p.$el.find('.plotpopupX'), o, leftMargin = 50;
			if (x) {
				o = plot.p2c({x: x});
				ttx.addClass('filled').html($.plot.formatDate(new Date(x), '%d.%m.%Y %H:%M:%S')).css({
					top: plot.getPlaceholder().height() - ttx.height() - 5,
					left: Math.max(Math.min(o.left + leftMargin - (ttx.width()/2), p.$el.width()-ttx.width()-30), 15)
				});
			} else {
				ttx.removeClass('filled');
			}
			
			var tt = p.$el.find('.plotpopupY');
			if (item) {
				o = plot.offset();
				tt.addClass('filled').find('b').css({
					'background-color': item.series.color
				}).end().find('span').html(item.series.label+' = '+item.datapoint[1]).end().css({
					top: item.pageY - o.top - tt.height(),
					left: Math.min(item.pageX - o.left + leftMargin, p.$el.width()-tt.width()-30)
				});
			} else {
				tt.removeClass('filled');
			}
			
//			App.showPlotTooltip(plot, item, x);
		}
		function toggleTogglerState(state) {
			$(p.$el.find('.js-toggle-checked')).find('b').text(state ? 'Скрыть все' : 'Показать все').end().find('span').removeClass().addClass(state ? 'icon-eye-close' : 'icon-eye-open');
		}
		function toggleLegendCheckers() {
			var hideAll = p.$el.find('.plotlegend label:not(.unchecked)').length > 0;
			p.$el.find('.plotlegend input').each(function(i, inp) {
				$(inp).prop('checked', !hideAll);
			});
			toggleTogglerState(hideAll);
			plotAccordingToChoices();
		}
		p.$el.bind('plothover', _.throttle(updateLegend, 50));
		p.$el.bind('plotselected', App.applyOnPlots.bind(App, 'setZoom'));
		if (p.addLegend !== false) {
			p.$el.find('.js-toggle-checked').removeClass('hide').on('click', toggleLegendCheckers);
		}
		p.$el.on('dblclick', App.applyOnPlots.bind(App, 'setZoom'));
		p.$el.on('click', 'input', function() {plotAccordingToChoices();});
//		p.$el.on('mouseout', function() {App.showPlotTooltip(null);});
		plot.setZoom = setZoom;
		plot.doResize = function() {
			plot.resize();
			plot.setupGrid();
			plot.draw();
			plot.clearCrosshair();
		};
		var $sel = p.$el.find('.btn-group').removeClass('hide'), arr = [], vals;
		if (p.pType === 2) {
			vals = ['avg','perc50','perc80','perc95','perc99','perc100','min','max','lossy'];
			plot.plotAccordingToChoices = plotAccordingToChoices;
		} else if (p.pType === 1 || p.pType === 3) {
			vals = ['rate','count'];
		}
		$sel.find('.js-selected').text(p.currentType);
		$.each(vals, function(i, v) {
			arr.push('<li'+(v === p.currentType ? ' class="active"' : '')+'><a tabindex="-1" href="#">'+v+'</a></li>');
		});
		$sel.find('ul').append(arr.join(''));
		$sel.on('click', 'a', function() {
			var val = $(this).text();
			$sel.find('.js-selected').text(val);
			p.currentType = val;
			plotAccordingToChoices();
			if (p.pType === 1 && (val === 'count' || val === 'rate')) {
				p.$el.find('.plotlegend #idrate').parent().find('span:last-child').text(val);
			}
		});
		App._registerPlot(p);
	}
};
App.showPlotTooltip = function(plot, item, x) {
	var ttx = App._plotAxisTooltip;
	if (!ttx) {
		ttx = App._plotAxisTooltip = $("<div></div>").css({
			position: "absolute",
			display: "none",
			padding: "2px",
			outline: '1px solid rgb(195, 99, 99)',
			margin: '4px 0 0 2px',
			'white-space': 'nowrap',
			'background-color': 'white'
		}).appendTo("body");
	}
	if (x) {
		var o = plot.p2c({x: x});
		ttx.html($.plot.formatDate(new Date(x), '%d.%m.%Y %H:%M:%S')).show().css({
			top: plot.offset().top + plot.height(),
			left: Math.min(plot.offset().left + o.left - ttx.width()/2, $(window).width()-ttx.width()-30)
		});
	} else {
		ttx.hide();
	}
	var tt = App._plotTooltip;
	if (!tt) {
		tt = App._plotTooltip = $("<div><b style='display: inline-block; width: 20px; border-radius: 10px; margin-right: 5px;'>&nbsp;</b><span></span></div>").css({
			position: "absolute",
			display: "none",
			padding: "2px",
			'white-space': 'nowrap',
			'background-color': 'white'
		}).appendTo("body");
	}
	if (item) {
		tt.find('b').css({
			'background-color': item.series.color
		}).end().find('span').html(item.series.label+' = '+item.datapoint[1]).end().show().css({
			top: item.pageY-30,
			left: Math.min(item.pageX+5, $(window).width()-tt.width()-30)
		});
	} else {
		tt.hide();
	}
};
App.showPlot = function(p1, p2) {
	App._createPlot(p1);
	App._createPlot(p2);
//	if (p1 && p2) {
//		p1.plot.getPlaceholder().on('zoomed', p2.plot.setZoom);
//		p2.plot.getPlaceholder().on('zoomed', p1.plot.setZoom);
//	}
};

App.getPlotScale = function(scale) {
	scale = scale || App.scale;
	switch(+scale) {
		case 21600: // 1 day
			return 60 * 60 * 24;
		case 3600: // 1 hour
			return 60 * 60;
		case 60: // 1 min
			return 60;
		case 5: // 5 sec
			return 5;
		default:
			return scale;
	}
};

App.getPlotAxisValueTime = function(val) {
	if (val >= 1e9) {
		var e = (val).toFixed(1).toString().length-1;
		return (val/Number('1e'+e)).toFixed(1) + 'e'+e+' s';
	} else if (val >= 1e6) {
		return (val/1e6).toFixed(0) + ' s';
	} else if (val >= 1e3) {
		return (val/1e3).toFixed(0) + ' ms';
	} else if (val >= 10) {
		return (val).toFixed(0) + ' μs';
	} else if (val > 0) {
		return (val).toFixed(2) + ' μs';
	} else {
		return '';
	}
};

App.getPlotAxisValueCount = function(val) {
	if (val >= 1e9) {
		var e = (val).toFixed(1).toString().length-1;
		return (val/Number('1e'+e)).toFixed(1) + 'e' + e;
	} else if (val >= 1e6) {
		return (val/1e6).toFixed(1) + 'M';
	} else if (val >= 1e3) {
		return (val/1e3).toFixed(1) + 'k';
	} else if (val > 10) {
		return (val).toFixed(0);
	} else if (val > 0) {
		return (val).toFixed(2);
	} else {
		return '';
	}
};

App.getPlotOptions = function(type) {
	var opt = {
		colors: "#FF0000,#00FF00,#0000FF,#FF00FF,#00FFFF,#000000,#70DB93,#B5A642,#5F9F9F,#B87333,#2F4F2F,#9932CD,#FFFF00,#871F78,#855E42,#545454,#8E2323,#F5CCB0,#238E23,#CD7F32,#DBDB70,#C0C0C0,#527F76,#9F9F5F,#8E236B,#2F2F4F,#EBC79E,#CFB53B,#FF7F00,#DB70DB,#D9D9F3,#5959AB,#8C1717,#238E68,#6B4226,#8E6B23,#007FFF,#00FF7F,#236B8E,#38B0DE,#DB9370,#ADEAEA,#5C4033,#4F2F4F,#CC3299,#99CC32".split(","),
		series: {
			shadowSize: null,
			lines: {
				show: true,
				lineWidth: 1
			},
			points: {
				symbol: function(octx, x, y) {
					octx.strokeStyle = $.color.parse(octx.strokeStyle).add('rg',-50).add('a', 1).toString();
					octx.arc(x, y, 2, 0, 2 * Math.PI, false);
				}
			}
		},
		legend: {
			show: false,
			margin: [-250,0]
		},
		xaxis: {
			mode: "time",
			max: Date.now(),
			min: Date.now() - ((App.getPlotScale()*1e3) * App.PLOT_HISTORY),
			minTickSize: [App.getPlotScale(), "second"],
			labelWidth: 40
		},
		yaxis: {
			labelWidth: 40
		},
		grid: {
			hoverable: true,
			borderWidth: 0
		},
		crosshair: {
			mode: "x"
		},
		selection: {
			mode: "x"
		},
		hooks: {
			drawSeries: [
				function(plot, ctx, series) {
					var x, px, nx, y,
						axisx = series.xaxis,
						axisy = series.yaxis,
						plotOffset = plot.getPlotOffset(),
						points = series.datapoints.points,
						ps = series.datapoints.pointsize;
					ctx.save();
					ctx.translate(plotOffset.left, plotOffset.top);
					for (var i = 0; i < points.length; i += ps) {
						x = points[i];
						y = points[i + 1];
						if (x == null || x < axisx.min || x > axisx.max || y < axisy.min || y > axisy.max) {
							continue;
						}
						px = points[i - ps];
						nx = points[i + ps];
						if (px == null && nx == null) {
							ctx.beginPath();
							x = axisx.p2c(x);
							y = axisy.p2c(y);
							ctx.lineWidth = 2;
							ctx.strokeStyle = series.color;
							ctx.arc(x, y, 1, 0, 2*Math.PI);
							ctx.closePath();
							ctx.stroke();
						}
					}
					ctx.restore();
				}
			]
		}
	};
	switch(type) {
		case 1:
			opt.yaxes = [ {
				tickFormatter: App.getPlotAxisValueTime
			}, {
				min: 0,
				alignTicksWithAxis: 1,
				position: "right",
				tickFormatter: App.getPlotAxisValueCount
			} ];
			break;
		case 2:
			opt.yaxes = [ {
				tickFormatter: App.getPlotAxisValueTime
			} ];
			opt.hooks.processOffset = [function(p, ofs) {ofs.right=50;}];
			break;
		case 3:
			opt.yaxes = [ {
				min: 0,
				position: "right",
				tickFormatter: App.getPlotAxisValueCount
			} ];
			opt.hooks.processOffset = [function(p, ofs) {ofs.left = 50;ofs.right=5;}];
			break;
	}
	
	return opt;
};

App._checkPlotData = function(result, ts, value, pts) {
	if (pts && (ts - pts)/1e3 > App.getPlotScale()) {
		result.push([ts, null]);
	}
	result.push([ts, value]);
};

App.getPlotDataSingle = function(data) {
	var scale = (data.scale/1e6) || App.getPlotScale(), ts, pts;
	return _.reduce(data.counters, function(result, item, i, list) {
		ts = item[0]/1e3;
		pts = i && (list[i-1][0]/1e3);
		App._checkPlotData(result[0].data, ts, item[1], pts);
		App._checkPlotData(result[1].data, ts, item[3], pts);
		App._checkPlotData(result[2].data, ts, item[4], pts);
		App._checkPlotData(result[3].data, ts, item[5], pts);
		App._checkPlotData(result[4].data, ts, item[6], pts);
		App._checkPlotData(result[5].data, ts, item[7], pts);
		App._checkPlotData(result[6].data, ts, item[2], pts);
		App._checkPlotData(result[7].data, ts, (item[2]/scale).toFixed(2), pts);

        App._checkPlotData(result[8].data, ts, item[8], pts);
        App._checkPlotData(result[9].data, ts, item[9], pts);
        App._checkPlotData(result[10].data, ts, item[10], pts);

		return result;
	}, [
		{label: 'avg',     color: '#0000a0', data: []},
		{label: 'perc50',  color: '#800000', data: []},
		{label: 'perc80',  color: '#e00000', data: []},
		{label: 'perc95',  color: '#ff8080', data: []},
		{label: 'perc99',  color: '#ffb0b0', data: []},
		{label: 'perc100', color: '#ffb757', data: [], skip: true},
		{label: 'count',   color: '#00a000', data: [], yaxis: 2},
		{label: 'rate',    color: '#00a000', data: [], yaxis: 2},
        {label: 'min',     color: '#ff0000', data: [], skip: true},
        {label: 'max',     color: '#5f9f9f', data: [], skip: true},
        {label: 'lossy',     color: '#9932cd', data: [], skip: true}

	]);
};
App.getOldPlotTS = function(data) {
	return +_.max(_.keys(data), function(ts){return +ts;}) || 0;
};
App.getOldPlotData = function(data, scale) {
	return _.reduce(data, function (res, c) {
		res[c[0]/1e3] = {
			'ts': c[0]/1e3,
			'avg': c[1],
			'count': c[2],
			'rate': Math.round(c[2]/scale),
			'perc50': c[3],
			'perc80': c[4],
			'perc95': c[5],
			'perc99': c[6],
			'perc100': c[7],
			'min': c[8],
			'max': c[9],
			'lossy': c[10]
		};
		return res;
	}, {});
};
App.getPlotData = function(data, nm) {
	var idx = 0, scale = (data.scale/1e6) || App.getPlotScale();
	return _.reduce(data, function(result, item) {
		var aname = item.name.split('~~'),
			lbl = (nm != null ? aname[nm] : _.last(aname)),
			p1 = {label: lbl, id: '-plbl-'+(idx++), data: {
				'avg': [],   
				'perc50': [],
				'perc80': [],
				'perc95': [],
				'perc99': [],
				'perc100': [],
					'min': [],
					'max': [],
					'lossy': []
			}},
			p2 = {label: lbl, id: '-plbl-'+(idx++), data: {
				'count': [],
				'rate': []
			}};
		for (var i = 0, c, ts, pts; i < item.counters.length; ++i) {
			c = item.counters[i];
			ts = c[0]/1e3;
			pts = i && (item.counters[i-1][0]/1e3);
			App._checkPlotData(p1.data.avg,     ts, c[1], pts); // avg
			App._checkPlotData(p2.data.rate,    ts, Math.round(c[2]/scale), pts); // rate
			App._checkPlotData(p2.data.count,   ts, c[2], pts); // count
			App._checkPlotData(p1.data.perc50,  ts, c[3], pts); // perc50
			App._checkPlotData(p1.data.perc80,  ts, c[4], pts); // perc80
			App._checkPlotData(p1.data.perc95,  ts, c[5], pts); // perc95
			App._checkPlotData(p1.data.perc99,  ts, c[6], pts); // perc99
			App._checkPlotData(p1.data.perc100, ts, c[7], pts); // perc100
            App._checkPlotData(p1.data.min, ts, c[8], pts); // min
            App._checkPlotData(p1.data.max, ts, c[9], pts); // max
            App._checkPlotData(p1.data.lossy, ts, c[10], pts); // lossy
			
		}
		result[0].push(p1);
		result[1].push(p2);
		return result;
	}, [[],[]]);
};

function curry(func, arg) {
	var args = [];
	for (var i = 1, argumentsLength = arguments.length; i < argumentsLength; i++) {
		args.push(arguments[i]);
	}
	return function () {
		var carg = _.clone(args);
		for (var i = 0, argumentsLength = arguments.length; i < argumentsLength; i++) {
			carg.push(arguments[i]);
		}
		return func.apply(func, carg);
	};
}

function getJsonFromUrl(query) {
	var data = query.split("&");
	var result = {};
	for (var i = 0, dataLength = data.length; i < dataLength; i++) {
		var item = data[i].split("=");
		result[item[0]] = item[1];
	}
	return result;
}

function mkscale(item, scale) {
	item.count = item.count / scale;
	return item;
}

function xround(val, scale, rounder) {
	return rounder(val / (scale||1)) * scale;
}

function draw_pair(elem, result, data3, from, from_scale, nm) {
	from = +from;
	var res = {ts: 0, data: {}, scale: (result.scale/1e6) || App.getPlotScale()};
	
	_.each(result.data, function (d) {
		var aname = d.name.split('~~'),
			lbl = (nm != null ? aname[nm] : _.last(aname)),
			dd = res.data[lbl] = App.getOldPlotData(d.counters, res.scale),
			dts = App.getOldPlotTS(dd);
		if (dts) res.ts = Math.max(res.ts, dts);
	});
	if (!res.ts && !res.scale) {return false;}
	
	var g1 = new window.btpgraph(res.ts, res.scale);
	var g2 = new window.btpgraph(res.ts, res.scale);
	
	_.each(res.data, function (d, n) {
		g1.addTime(d, n);
		g2.addCount(d, n);
	});
	
	g1.init(elem, {width: App.current_width, percSelector: true});
	g2.init(elem, {width: App.current_width, rateAndCountSelector: true});
	g1.setPair(g2);
	g2.setPair(g1);
}

$(function () {
    window.location.hash = window.location.hash.replace(/(%3C([^]+)%3E)/ig, '');
	btp.show('serverlist', {data: App.hostConfig.cluster.types}, '#serverlist');

	window.btp.cluster = App.hostConfig.cluster.default;
    
	App._cacheAlive = App.hostConfig['cacheTTL'] || Infinity; // (14*24*60*60*1000) = 14 days
	App.scale = 5;

	var m = document.cookie.match(/JCB\{(.+)\}JCE/);
	if (m != null) {
		var data = getJsonFromUrl(m[1]);
		if (typeof(data.scale) !== 'undefined') {App.scale = data.scale * 1;}
		if (typeof(data.cluster) !== 'undefined') {window.btp.cluster = data.cluster;}
	}

    App.set(window.btp.cluster, 'HostGroup');
    App.set(App.scale, 'Scale');
	var graph = 'flot';
	if (btp.isLocalStorageAvailable()) {
		graph = localStorage['Graph'] || graph;
	}
	App.set(graph, 'Graph');

	new App.Controllers();

	btp.show('layout', {}, '#content');

	$(document)
		.on('click', '.js-selector ul a', function (e) {
			App.Updaters.reset();
			var type = $(this).closest('.js-selector').data('type'),
				val = $(this).data('value');
			App.set(val, type);

			Backbone.history.loadUrl();
			return true;
		})
		.on('click', '.js-mainmenu', function (e) {
			var $that = $(this);
			$('.js-mainmenu').removeClass('active');
			$that.addClass('active');
			return true;
		})
		.on('click', 'ul.dropdown-menu li a', function (e) {
			e.preventDefault();
			var $thatParent = $(this).parent();
			$thatParent.siblings('.active').removeClass('active');
			$thatParent.addClass('active');
		})
		.on('click', 'ul li a.js-reload', function (e) {
			e.preventDefault();
			App.Updaters.reset();
			Backbone.history.loadUrl();
		})
		.on("keydown", ".form-search input", _.debounce(function () {
			var v = $(this).val().toLocaleLowerCase();
			App.Updaters.update_left_selection(v, 1);
		}, 300))
		.on("submit", ".form-search", function (e) {
			e.preventDefault();
		})
		.on('click', 'ul li a.js-errors', function(e) {
			e.preventDefault();
			var $errModal = $('#errorList');
			$errModal.modal('show').one('hide', function() {
				$('ul li a.js-errors').parent().addClass('empty').end().find('b').text('0');
				//$errModal.find('.js-error-list').empty();
				$errModal.find('.alert.msg-container-top').addClass('viewed');
			});
		})
		.on('click', 'ul li a.js-reset-list', function(e) {
			e.preventDefault();
			window.btp.clearCache();
			App.Updaters.reset();
			Backbone.history.loadUrl();
		});

	$('#content-left').on('click', function (e) {
		var t = $(e.target),
			c = t.closest('.item'),
			p = t.closest('.js-parent');

		// we're templating all the time because of optimizations made in templating phase (in btp.show)
		if (!c.length && p.length) {
			e.preventDefault();
			if (!p.hasClass('show')) {
				var d = btp.dataList && btp.dataList[p.index()];
				if (d && d.items) {
                    for (var i = 0; i < d.items.length; i++) {
                        if (d.items[i].val.match(/(<[\s\S]*(.*?)>)/ig)) {
                            d.items[i].val = d.items[i].val.replace(/(<[\s\S]*(.*?)>)/ig, '');
                        }
                        if (d.items[i].name.match(/(<[\s\S]*(.*?)>)/ig)) {
                            d.items[i].name = d.items[i].name.replace(/(<[\s\S]*(.*?)>)/ig, '');
                        }
                    }
					btp.show('left_list', {
						r: d.items,
						link: curry(getLink, btp.dataType)
					}, p.find('.items'));
				}
				p.data('active', 1);
			}
			p.toggleClass('show');
		}
	});

	// it's for parital data appending loader
	(function ($) {
		"use strict";
		var $chunksLoader = $('#js-chunks-loader'),
			loaderInitialWidth = $chunksLoader.outerWidth();
		$(document).on('loader.progress', function (e, params) {
			var progress = params.progress || 0;
			if (progress > 1) {
				progress = progress / 100;
			}
			// don't fuck with me
			if (progress > 1) {
				progress = 0;
			}
			$chunksLoader.
				show().
				css('width', loaderInitialWidth * progress);
		});
		$(document).on('loader.finished', function (e, params) {
			$chunksLoader.
				hide().
				css('width', '');
		});
	}($));

	$(window)
		.on('resize', _.debounce(function () {
			App.current_width = $(window).width() - 400;
		}, 50))
		.trigger('resize');

	Backbone.history.start();

	//TODO:
	//window.btp.query("get_warnings",{script:"?",service:'SCRIPT', scale:1800},function(res){ });
	//window.btp.query("get_warnings",{service:'?',scale:1800},function(res){ });
	
	
	
});

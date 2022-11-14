var App = window.App || {};

App.Updaters = {
    index: {},
    indexData: {},
    reset: function () {
        this.index = {};
        this.indexData = {};
    },
    header: function (type) {
        var $navbarLI = $('.navbar ul.nav li');
        $navbarLI.removeClass('active');
        $navbarLI.filter('[data-type="' + type + '"]').addClass('active');
    },
    update_left_selection: function (selected, filter) {
        //console.log(selected);

        var con = $('#content-left'),
            ch = con.children(),
            chc,
            sh,
            act,
            z,
            j,
            listItems,
            value,
            valueLower,
            hasBeenSelected = false;

        selected = $.trim(selected);
        if (selected === '' && filter) {
            filter = false;
            selected = con.data('selected');
        }
        if (!filter) {
            con.data('selected', selected);
        }

        for (z = 0; z < btp.dataList.length; z++) {
            listItems = btp.dataList[z] && btp.dataList[z].items;
            if (listItems) {
                chc = 0;
                sh = 0;
                for (j = 0; j < listItems.length; j++) {
                    value = String(listItems[j].val);
                    valueLower = value.toLocaleLowerCase();
                    if ((!filter &&  value === selected) ||
                        (filter && valueLower.indexOf(selected) >= 0)) {
                        ch.eq(z).trigger('click');
                        sh = 1;
                        break;
                    }
                }
                ch.eq(z)[sh === 1 ? 'addClass' : 'removeClass']('show');
                sh = 0;
                if (ch.eq(z).data('active')) {
                    chc = ch.eq(z).find('ul').children();

                    // it's here for performance
                    if (!filter) {
                        chc.filter('.active').removeClass('active');
                    }

                    for (j = 0; j < listItems.length; j++) {
                        value = String(listItems[j].val);
                        valueLower = value.toLocaleLowerCase();
                        if (filter) {
                            act = valueLower.indexOf(selected) >= 0;
                            chc.eq(j)[act ? 'show' : 'hide']();
                        } else {
                            act = value === selected;
                            if (act) {
                                chc.eq(j).addClass('active');
                                hasBeenSelected = true;
                            }
                            chc.eq(j).show();
                        }
                        if (act) {sh = 1;}
                    }
                }
                ch.eq(z)[!filter || sh === 1 ? 'show' : 'hide']();
            } else {
                if (filter) {
                    ch.eq(z)[btp.dataList[z].val.toLocaleLowerCase().indexOf(selected) >= 0 ? 'show' : 'hide']();
                } else {
                    if (btp.dataList[z].val === selected) {
                        hasBeenSelected = true;
                        ch.eq(z).addClass('active').show();
                    } else {
                        ch.eq(z).removeClass('active').show();
                    }
                }
            }
        }
        return hasBeenSelected;
    },
    left_dashboards: function (selected) {
        //console.time('left_dashboards');

        if (App.Updaters.index.left == 'dashboards') {
            this.update_left_selection(selected);
        } else {
            $('.js-mainmenu').filter('[data-type="dashboard"]').click();

            var data = Dashboards.getList();
            btp.dataList = data;
            btp.dataType = 'dashboard';
            btp.show('left_list', {
                r: data,
                link: curry(getLink, btp.dataType),
                header: 'Дашборды'
            }, '#content-left').then(function() {
                App.Updaters.update_left_selection(selected);
            });
        }
        App.Updaters.index.left = 'dashboards';
        $('.form-search').find('input').focus();

        //console.timeEnd('left_dashboards');
    },
    left_services: function (selected) {
        //console.time('left_services');
        var dfd = $.Deferred();

        if (App.Updaters.index.left == 'services') {
            if (this.update_left_selection(selected)) {
                dfd.resolve(false);
            } else {
                dfd.reject();
            }
        } else {
            $('.js-mainmenu').filter('[data-type="service"]').click();
            $.when(
                btp.query('get_list', {service: '?', scale: App.scale, sortby: ''})
                //,btp.query('get_warnings', {service:'?',scale:1800})
            ).done(function (data, warn) {
                btp.dataList = data = transform_list('services', data, warn);
                btp.dataType = 'service';
                btp.show('left_list', {
                    r: data,
                    link: curry(getLink, btp.dataType),
                    header: 'Сервисы'
                }, '#content-left').then(function() {
                    if (App.Updaters.update_left_selection(selected)) {
                        dfd.resolve(true);
                    } else {
                        dfd.reject();
                    }
                });
            }).fail(function(err) {
                dfd.reject(err);
            });
        }
        App.Updaters.index.left = 'services';
        $('.form-search').find('input').focus();

        //console.timeEnd('left_services');
        return dfd.promise();
    },
    left_scripts: function (selected) {
        //console.time('left_scripts');
        var dfd = $.Deferred();

        if (App.Updaters.index.left == 'scripts') {
            if (this.update_left_selection(selected)) {
                dfd.resolve(false);
            } else {
                dfd.reject();
            }
        } else {
            $('.js-mainmenu[data-type="script"]').click();
            $.when(
                btp.query('get_list', {script: '?', scale: App.scale, sortby: ''})
                //,btp.query('get_warnings', {service:'SCRIPT_wwwnew',script:'?',scale:1800})
            ).done(function (data, warn) {
                btp.dataList = data = transform_list('scripts', data, warn);
                btp.dataType = 'script';
                btp.show('left_list', {
                    r: data,
                    link: curry(getLink, btp.dataType),
                    header: 'Скрипты'
                }, '#content-left').then(function() {
                    if (App.Updaters.update_left_selection(selected)) {
                        dfd.resolve(true);
                    } else {
                        dfd.reject();
                    }
                    dfd.resolve(true);
                });
            }).fail(function(err) {
                dfd.reject(err);
            });
        }
        App.Updaters.index.left = 'scripts';
        $('.form-search').find('input').focus();

        //console.timeEnd('left_scripts');
        return dfd.promise();
    },
    left_empty: function () {
        App.Updaters.index.left = 'empty';
        $('#content-left').html('');
    },
    right_empty: function () {
        App.Updaters.index.right = 'empty';
        $('#content-right').html('');
    },
    right_container: function (force) {
        if (force || App.Updaters.index.right != 'container') {
            btp.show('right_container', {}, '#content-right');
            this.makeempty('right_top');
            this.makeempty('right_middle');
            this.makeempty('right_middle2');
            this.makeempty('right_bottom');
        }
        App.Updaters.index.right = 'container';
    },

    _right_x: function (key, name, cb, cb2) {
        if (App.Updaters.index[key] != name) {
            $('#' + key).html('');
            cb('#' + key);
        } else {
            // cb2 ? cb2('#' + key) : null;
            $('#' + key).html('');
            cb2 ? cb2('#' + key) : null;
            cb('#' + key);
        }

        App.Updaters.index[key] = name;
    },
    right_top: function (name, cb, cb2, power) { return App.Updaters._right_x("right-top", name, cb, cb2, power); },
    right_middle: function (name, cb, cb2, power) { return App.Updaters._right_x("right-middle", name, cb, cb2, power); },
    right_middle2: function (name, cb, cb2, power) { return App.Updaters._right_x("right-middle2", name, cb, cb2, power); },
    right_bottom: function (name, cb, cb2, power) { return App.Updaters._right_x("right-bottom", name, cb, cb2, power); },

    makeempty: function (pos) {
        var dfd = $.Deferred();
        App.Updaters[pos]('empty', function (element) {
            dfd.resolve($(element).html(''));
            App.Updaters.index[pos] = null;
        }, function(element) {
            dfd.reject($(element));
        });
        return dfd;
    },
    makelist: function (pos, header, key, data, link, addEmpty, selected, callback) {
        // console.log(arguments);
        var dfd = $.Deferred();

        var select_cb = function (element) {
            var activeClass = 'active';
            $('li.' + activeClass, element).removeClass(activeClass);
            if (typeof(selected) != 'undefined') {
                $('li[data-val="' + selected + '"]', element).addClass(activeClass);
            }
        };
        if (typeof data == 'object') {
            data.scale = App.scale
        }
        // typeof data == 'object' && (data.scale = App.scale); морально не читаемо

        App.Updaters[pos](key, function (element) {
            delete App.Updaters.indexData[key];
            $.when(
                btp.query('get_list', data)
                //,btp.query('get_warnings', $.extend(data,{scale:1800}))
            ).done(function (res, warn) {
                res = parse_names_from_path(res, data.op ? 3 : 2);
                if (addEmpty && res.length > 0) {res.push("");}
                App.Updaters.indexData[key] = res;
                btp.show('li_list', {
                    r: res,
                    link: link,
                    warnings: warn,
                    header: header
                }, element).done(function($el) {
                    select_cb($el);
                    callback ? callback(res) : null;
                    dfd.resolve(res, $el);
                });
            });
        }, function (elem) {
            select_cb(elem);
            callback ? callback(App.Updaters.indexData[key]) : null;

            dfd.resolve(App.Updaters.indexData[key], $(elem));

        }, !!data.power );

        return dfd.promise();
    },

    dummy: null
};

App.OldControllers = {

    //====================================================
    //
    // SERVICES
    //
    //====================================================

    service: function (name) {
        name = decodeparam(name);
        App.Updaters.left_services(name).done(function() {
            App.Updaters.right_container(true);
            App.OldControllers.service_server_right_top(name);
        }).fail(function() {
            window.btp.onError({title: 'Ошибка в данных', msg: 'Сервис '+name+' не найден!'});
        });
    },

    service_srv: function (name, server) {
        name = decodeparam(name);
        server = decodeparam(server);
        if (server == "@") server = "";
        App.Updaters.right_container();
        App.Updaters.left_services(name).done(function() {
            App.OldControllers.service_server_right_top(name, server).done(function() {
                var def = 'count';
                function refresh(sortby, powerCheck) {

                    App.OldControllers.service_server_right_middle(name, server, sortby, powerCheck).done(function(opers, $el) {

                        opers = opers.map(function(currentValue){
                            if(currentValue.lastIndexOf('~~') > -1) {
                                return currentValue.substring(currentValue.lastIndexOf('~~') + 2);
                            }
                            else {
                                return currentValue;
                            }
                        });

                        App.Updaters.makeempty('right_middle2');
                        App.Updaters.makeempty('right_bottom');


                        App.OldControllers.service_server_right_bottom(name, server, opers, powerCheck).done(function() {
                            var $sel = $el.find('.js-sortby-selector').removeClass('hide'), arr = [];
                            var $cel = $el.find('.js-sortby-powerCheckbox');
                            $el.find('.js-sortby-power').removeClass('hide');
                            if (powerCheck) {
                                if($el.find('.js-sortby-powerCheckbox')[0]){
                                    $el.find('.js-sortby-powerCheckbox')[0].checked = true;
                                }

                            }

                            $sel.find('.js-selected').text(sortby);
                            $.each(['nosort','avg','perc50','perc80','perc95','perc99','perc100','min','max','lossy','count'], function(i, v) {
                                arr.push('<li'+(v === sortby ? ' class="active"' : '')+'><a tabindex="-1" href="#">'+v+'</a></li>');
                            });
                            $sel.find('ul').append(arr.join(''));


                            $sel.on('click', 'a', function() {
                                var val = $(this).text();
                                var power = powerCheck;
                                $sel.find('.js-selected').text(val);
                                if ($el.find('.js-sortby-powerCheckbox')[0].checked) {
                                    power = true;
                                }
                                refresh(val, power);
                            });


                            $cel.on('click', function() {
                                powerCheck = !powerCheck;
                                var val = sortby;
                                var power = powerCheck
                                refresh(val, power);

                            });
                        });
                    });
                };
                refresh(def);
            });
        }).fail(function() {
            window.btp.onError({title: 'Ошибка в данных', msg: 'Сервис '+name+' не найден!'});
        });
    },

    service_srv_op: function (name, server, op) {
        name = decodeparam(name);
        server = decodeparam(server);
        if (server == "@") server = "";
        App.Updaters.right_container();
        App.Updaters.left_services(name).done(function() {
            App.OldControllers.service_server_right_top(name, server).done(function() {
                App.OldControllers.service_server_right_middle(name, server).done(function() {
                    App.OldControllers.service_server_right_middle2(name, server, op).done(function() {
                        App.Updaters.makeempty('right_bottom');
                        App.OldControllers.service_server_right_bottom2(name, server, op);
                    }).fail(function() {
                        App.Updaters.makeempty('right_bottom').always(function($el){
                            $el.html('<h3 class="text-error">Нет данных</h3>');
                            $('#right-middle ul li').each(function(i, el) {
                                var $el = $(el);
                                $el.find('>a').toggleClass('text-error', $el.data('val') === op);
                            });
                        });
                    });
                });
            });
        }).fail(function() {
            window.btp.onError({title: 'Ошибка в данных', msg: 'Сервис '+name+' не найден!'});
        });
    },

    service_server_right_top: function(name, server) {
        var res;
        if (server != null) {
            res = App.Updaters.makelist(
                'right_top',
                'Серверы, которые обслуживают сервис ' + name,
                'servers_of_' + name,
                {service: name, server: '?'},
                curry(getLink, 'service', name),
                true,
                server
            );
        } else {
            res = App.Updaters.makelist(
                'right_top',
                'Серверы, которые обслуживают сервис ' + name,
                'servers_of_' + name,
                {service: name, server: '?'},
                curry(getLink, 'service', name),
                true,
                server,
                function (res) {
                    if (res && res.length == 1) {
                        Backbone.history.navigate(getLink('service', name, res[0]), {trigger: true, replace: true});
                    } else {
                        Backbone.history.navigate(getLink('service', name, ""), {trigger: true, replace: true});
                    }
                }
            );
        }
        return res;
    },

    service_server_right_middle: function(name, server, sortby, powerCheck) {
        return App.Updaters.makelist(
            'right_middle',
            'Операции на сервере ' + server,
            'ops_' + server + '_' + sortby,
            {service: name, server: server, op: '?', sortby: sortby, power: powerCheck},
            curry(getLink, 'service', name, server),
            false,
            sortby
        );
    },

    service_server_right_middle2: function(name, server, op) {
        var dfd = $.Deferred();
        App.Updaters.right_middle2('gr_' + name + '_' + server + '_' + op, function (element) {
            btp.query('get_graph', {service: name, server: server, op: op, scale: App.scale }).done(function (res) {
                $('#graphs').html('');
                if (App.newGraph && App.isAPIv2) {
                    App.showPlot({
                        el: element,
                        data: App.getPlotDataSingle(res),
                        pType: 1,
                        addLegend: true,
                        link: curry(getLink, 'service', name, server)
                    });
                } else {
                    var scale = (res.scale/1e6) || App.getPlotScale(),
                        data = App.getOldPlotData(res.counters, scale),
                        dts = App.getOldPlotTS(data),
                        g = new window.btpgraph(dts, scale);
                    g.addCount(data, op).addTime(data, op);
                    g.init(element, {width: App.current_width, rateAndCountSelector: true});
                }
                dfd.resolve(true);
            }).fail(function() {
                dfd.reject();
            });
        });
        return dfd.promise();
    },

    service_server_right_bottom: function(name, server, ops, power) {
        console.log(ops);
        var dfd = $.Deferred();
        App.Updaters.right_bottom('service_' + name + "_" + server, function (element) {
            $.when(
                btp.query('get_multigraph', {field: 'perc80', service: name, server: server, op: '*', scale: App.scale, names: ops, power: power}),
                App.isAPIv2 ? true : btp.query('get_multigraph', {field: 'count', service: name, server: server, op: '*', scale: App.scale, names: ops})
            ).done(function(data1, data2) {
                if (!data1 || !data2) {
                    dfd.reject();
                    return;
                }
                if (App.newGraph && App.isAPIv2) {
                    var plotData = App.getPlotData(data1.data, null);
                    App.showPlot({
                        el: element,
                        data: plotData[0],
                        pType: 2,
                        addLegend: true,
                        link: curry(getLink, 'service', name, server)
                    }, {
                        el: element,
                        data: plotData[1],
                        pType: 3
                    });
                } else {
                    draw_pair(element, data1, data2, 0, 0.5, null);
                }
                dfd.resolve(true);
            }).fail(function() {
                dfd.reject();
            });
        });
        return dfd.promise();
    },






    service_server_right_bottom2: function(name, server, op) {
        var dfd = $.Deferred();
        var limit = 10;
        App.Updaters.makelist(
            'right_middle',
            'Операции на сервере ' + server,
            'ops_' + server,
            {service: name, server: server, op: '?'},
            curry(getLink, 'service', name, server),
            false,
            op,
            function () {
                var def = 'count', reload_rb = function (sortby, powerCheck) {
                    App.Updaters.right_bottom('gr_' + name + '_' + server + '_' + op +'_'+ limit +'_'+ sortby + '_' + powerCheck, function (element) {
                        if (server != "_" && server != "" && $('#right-top li a').length != 1){
                            return;
                        }
                        btp.query('get_list', {service: name, op: op, script: "?", limit: limit, scale: App.scale, sortby: sortby, power: powerCheck}).done(function (res2) {
                            res2 = parse_names_from_path(res2, 1);
                            btp.show('li_list',
                                {
                                    r: res2,
                                    link: curry(function() {
                                        var args;
                                        (args = [].slice.call(arguments, 0)).push(name);
                                        return getLink.apply(this, args);
                                    }, 'script'),
                                    linkPostfix: name,
                                    warnings: [],
                                    header: 'Скрипты, которые вызывают ' + op + ' сервиса ' + name + " (top" + limit + " / <a class='js-load-next' href='#'>top" + (limit + 20) + "</a>)"
                                },
                                '#right-bottom').done(function($el) {
                                if (App.newGraph && App.isAPIv2) {
                                    var $sel = $el.find('.js-sortby-selector').removeClass('hide'), arr = [];
                                    var $cel = $el.find('.js-sortby-powerCheckbox');
                                    $el.find('.js-sortby-power').removeClass('hide');
                                    $sel.find('.js-selected').text(sortby);
                                    if (powerCheck) {
                                        $el.find('.js-sortby-powerCheckbox')[0].checked = true;
                                    }

                                    $.each(['avg','perc50','perc80','perc95','perc99','perc100','min','max','lossy','count'], function(i, v) {
                                        arr.push('<li'+(v === sortby ? ' class="active"' : '')+'><a tabindex="-1" href="#">'+v+'</a></li>');
                                    });
                                    $sel.find('ul').append(arr.join(''));
                                    $sel.on('click', 'a', function() {
                                        var val = $(this).text();
                                        var power = powerCheck;

                                        if ($el.find('.js-sortby-powerCheckbox')[0].checked) {
                                            power = true;
                                        }


                                        $sel.find('.js-selected').text(val);
                                        reload_rb(val, power);
                                    });
                                    $cel.on('click', function() {
                                        powerCheck = !powerCheck;
                                        reload_rb(sortby, powerCheck);
                                    });
                                    btp.query('get_multigraph', {names: _.map(res2 || [], function(scr) { return 'script~~'+scr+'~~'+name+'~~'+op;})}).done(function(data){
                                        var plotData = App.getPlotData(data.data, 1);
                                        App.showPlot({
                                            el: element,
                                            data: plotData[0],
                                            pType: 2,
                                            addLegend: true,
                                            link: curry(getLink, 'service', name, server)
                                        }, {
                                            el: element,
                                            data: plotData[1],
                                            pType: 3
                                        });
                                    });
                                } else {
                                    btp.query('get_multigraph', {names: _.map(res2 || [], function(scr) { return 'script~~'+scr+'~~'+name+'~~'+op;})}).done(function(result){
                                        dfd.resolve();
                                        if (!result.data || !result.data.length) {return;}
                                        var res = {ts: 0, data: {}, scale: (result.scale/1e6) || App.getPlotScale()};

                                        _.each(result.data, function (d) {
                                            var nm = d.name.split('~~')[1],
                                                dd = res.data[nm] = App.getOldPlotData(d.counters, res.scale),
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
                                        g1.init(element, {width: App.current_width, percSelector: true});
                                        g2.init(element, {width: App.current_width, rateAndCountSelector: true});
                                        g1.setPair(g2);
                                        g2.setPair(g1);
                                    });
                                }
                                $('#right-bottom h3 a.js-load-next').unbind('click').bind('click', function (e) {
                                    e.preventDefault();
                                    limit += 20;
                                    reload_rb(sortby);
                                });
                            });
                        });
                    });
                };
                reload_rb(def);
            }
        );
        return dfd.promise();
    },

    //====================================================
    //
    // SCRIPTS
    //
    //====================================================

    script: function (name) {
        name = decodeparam(name);
        App.Updaters.left_scripts(name).done(function() {
            App.Updaters.right_container(true);
            App.Updaters.makeempty('right_bottom');
            App.OldControllers.script_service_right_top(name);
        }).fail(function() {
            window.btp.onError({title: 'Ошибка в данных', msg: 'Скрипт '+name+' не найден!'});
        });
    },

    script_service: function (name, service) {
        App.Updaters.right_container();
        App.Updaters.left_scripts(name).done(function() {
            App.OldControllers.script_service_right_top(name, service).done(function() {
                var def = 'count';
                function refresh(sortby) {
                    App.Updaters.makeempty('right_middle');
                    App.Updaters.makeempty('right_middle2');
                    App.Updaters.makeempty('right_bottom');
                    App.OldControllers.script_service_right_middle(name, service, null, sortby).done(function(opers, $el) {
                        App.OldControllers.script_service_right_bottom_pair(name, service, opers).done(function() {
                            var $sel = $el.find('.js-sortby-selector').removeClass('hide'), arr = [];
                            $el.find('.js-sortby-power').removeClass('hide');
                            $sel.find('.js-selected').text(sortby);
                            $.each(['avg','perc50','perc80','perc95','perc99','perc100','min','max','lossy','count'], function(i, v) {
                                arr.push('<li'+(v === sortby ? ' class="active"' : '')+'><a tabindex="-1" href="#">'+v+'</a></li>');
                            });
                            $sel.find('ul').append(arr.join(''));
                            $sel.on('click', 'a', function() {
                                var val = $(this).text();
                                $sel.find('.js-selected').text(val);
                                refresh(val);
                            });
                        });
                    }).fail(function() {
                        App.Updaters.makeempty('right_bottom').always(function($el){
                            $el.html('<h3 class="text-error">Нет данных</h3>');
                        });
                        $('#right-middle ul li').each(function(i, el) {
                            var $el = $(el);
                            $el.find('>a').toggleClass('text-error', $el.data('val') === op);
                        });
                    });
                }
                refresh(def);
            });
        }).fail(function() {
            window.btp.onError({title: 'Ошибка в данных', msg: 'Скрипт '+name+' не найден!'});
        });
    },

    script_service_op: function (name, service, op) {
        name = decodeparam(name);
        service = decodeparam(service);
        App.Updaters.right_container();
        App.Updaters.left_scripts(name).done(function() {
            App.OldControllers.script_service_right_top(name, service).done(function() {
                App.OldControllers.script_service_right_middle(name, service, op).done(function(dummy, $el) {
                    $el.find('.js-sortby-selector').addClass('hide');
                    $el.find('.js-sortby-power').addClass('hide');
                    App.Updaters.makeempty('right_middle2');
                    App.OldControllers.script_service_right_bottom_single(name, service, op).fail(function() {
                        App.Updaters.makeempty('right_bottom').always(function($el){
                            $el.html('<h3 class="text-error">Нет данных</h3>');
                        });
                        $('#right-middle ul li').each(function(i, el) {
                            var $el = $(el);
                            $el.find('>a').toggleClass('text-error', $el.data('val') === op);
                        });
                    });
                }).fail(function() {
                    App.Updaters.makeempty('right_middle2').always(function($el){
                        $el.html('<h3 class="text-error">Нет данных</h3>');
                    });
                });
            });
        }).fail(function() {
            window.btp.onError({title: 'Ошибка в данных', msg: 'Скрипт '+name+' не найден!'});
        });
    },

    script_service_right_top: function(name, service) {
        return App.Updaters.makelist(
            'right_top',
            'Сервисы, которые используются из ' + name,
            'services_of_' + name,
            {script: name, service: '?', sortby: ''},
            curry(getLink, 'script', name),
            false,
            service
        );
    },

    script_service_right_middle: function(name, service, op, sortby) {
        return App.Updaters.makelist(
            'right_middle',
            'Операции с сервисом <a href="#service/'+encodeparam(service)+'//?'+$.param(App.getLinkParams())+'">' + service + "</a>, которые используются из " + name,
            'ops_' + service,
            {script: name, service: service, op: '?', sortby: sortby},
            curry(getLink, 'script', name, service),
            false,
            op
        );
    },

    script_service_right_bottom_single: function(name, service, op) {
        var dfd = $.Deferred();
        App.Updaters.right_bottom('script_' + name + "_" + service + "_" + op, function (element) {
            btp.query('get_graph', {script: name, service: service, op: op, scale: App.scale }).done(function (res) {
                $('#graphs').html('');
                if (App.newGraph && App.isAPIv2) {
                    App.showPlot({
                        el: element,
                        data: App.getPlotDataSingle(res),
                        pType: 1,
                        addLegend: true,
                        link: curry(getLink, 'script', name, service)
                    });
                } else {
                    var scale = (res.scale/1e6) || App.getPlotScale(),
                        data = App.getOldPlotData(res.counters, scale),
                        dts = App.getOldPlotTS(data),
                        g = new window.btpgraph(dts, scale);
                    g.addCount(data, op).addTime(data, op);
                    g.init(element, {width: App.current_width, rateAndCountSelector: true});
                }
                //
                dfd.resolve(element);
            }).fail(function() {
                dfd.reject();
            });
        });
        return dfd.promise();
    },

    script_service_right_bottom_pair: function(name, service, ops) {
        var dfd = $.Deferred();
        App.Updaters.right_bottom('script_' + name + "_" + service, function (element) {
            $.when(
                btp.query('get_multigraph', {field: 'perc80', script: name, service: service, op: '*', scale: App.scale, names: ops}),
                App.isAPIv2 ? true : btp.query('get_multigraph', {field: 'count', script: name, service: service, op: '*', scale: App.scale, names: ops})
            ).done(function(data1, data2) {
                if (!data1 || !data2) {
                    dfd.reject();
                    return;
                }
                if (App.newGraph && App.isAPIv2) {
                    var plotData = App.getPlotData(data1.data, 3);
                    App.showPlot({
                        el: element,
                        data: plotData[0],
                        pType: 2,
                        addLegend: true,
                        link: curry(getLink, 'script', name, service)
                    }, {
                        el: element,
                        data: plotData[1],
                        pType: 3
                    });
                } else {
                    draw_pair(element, data1, data2, 0, 0.5, 3);
                }
                dfd.resolve(true);
            }).fail(function(err) {
                dfd.reject(err);
            });
        });
        return dfd.promise();
    },

    index: function () {
        btp.show("index", {}, '#contentRight');
    },

    dummy: null
};

App.Controllers = window.Backbone.Router.extend({
    routes: {
        "service/*str": "service",
        "script/*str": "script",
        "dashboard/*str": "dashboard",
        "": "index"
    },
    oldctl: null,
    initialize: function (options) {
        this.oldctl = App.OldControllers;
    },
    script: function (str) {
        if (App._category !== 'script') {
            App._category = 'script';
            App.Updaters.left_empty();
            App.Updaters.right_empty();
        }
        var p = App.parse_url(str);
        if (p.length == 0) {
            return this.scripts();
        }

        var f = '';
        if (p.length == 3) {
            f = 'script_service_op'
        } else if (p.length == 2) {
            f = 'script_service'
        } else {
            f = 'script';
        }
        return this.oldctl[f].apply(this.oldctl, p.path);
    },
    service: function (str) {
        if (App._category !== 'service') {
            App._category = 'service';
            App.Updaters.left_empty();
            App.Updaters.right_empty();
        }
        var p = App.parse_url(str);
        if (p.length == 0) {
            return this.services();
        }
        var f = '';
        if (p.length == 3) {
            f = 'service_srv_op'
        } else if (p.length == 2) {
            f = 'service_srv'
        } else {
            f = 'service';
        }
        return this.oldctl[f].apply(this.oldctl, p.path);
    },
    dashboard: function (str) {
        App._category = 'dashboard';
        var p = App.parse_url(str);
        if (p.length == 0) {
            App.Updaters.left_dashboards();
            App.Updaters.right_empty();
        } else {
            App.Updaters.left_dashboards(p.path[0]);
            App.Updaters.right_empty();
            App.Updaters.index.right = 'dashboard';
            Dashboards[p.path[0]]($('#content-right'));
        }
    },
    scripts: function () {
        App.Updaters.left_empty();
        App.Updaters.left_scripts();
        App.Updaters.right_empty();
    },
    services: function () {
        App.Updaters.left_empty();
        App.Updaters.left_services();
        App.Updaters.right_empty();
    },
    index: App.OldControllers.index
});

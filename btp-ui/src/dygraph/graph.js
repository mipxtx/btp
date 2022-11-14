var btpgraphid = 0;

var btpgraph = function (ts, scale) {
	this.ts = xround(ts - 0, scale, Math.round);
	this.scale = scale;
	this.dataCount = [];
	this.dataTime = [];
	this.nameCount = [];
	this.nameTime = [];
	this.pair = null;
	this.id = ++window.btpgraphid;
	return this;
};

btpgraph.prototype = {
	setTs: function (ts) {
		this.ts = xround(ts - 0, this.scale, Math.round);
		return this;
	},
	addCount: function (item, name) {
		this.dataCount.push(item);
		this.nameCount.push(name);
		return this;
	},
	addTime: function (item, name) {
		this.dataTime.push(item);
		this.nameTime.push(name);
		return this;
	},
	init: function (parent, _params) {
		var $content = $('<div class="plothandler '+ (_params.rateAndCountSelector ? 'rate' : '') +'"></div>'), self = this;
		$content.append(this.createNode(_params));
		if (_params && (_params.percSelector || _params.rateAndCountSelector)) {
			var vals, arr=[], current, $sel = $('<div class="plotoptions"><div class="btn-group select-graph btp ' + (_params.percSelector ? 'perc' : '') +'"><button class="btn btn-small dropdown-toggle" data-toggle="dropdown"><span class="value js-selected"></span><span class="caret"></span></button><ul class="dropdown-menu"></ul></div></div>');
			if (_params.percSelector) {
				vals = ['avg','perc50','perc80','perc95','perc99','perc100'];
				current = 'perc80';
			} else if (_params.rateAndCountSelector) {
				vals = ['rate','count'];
				current = 'rate';
			}
			$.each(vals, function(i, v) {
				arr.push('<li'+(v === current ? ' class="active"' : '')+'><a tabindex="-1" href="#">'+v+'</a></li>');
			});
			$sel.on('click', 'a', function (e) {
				e.preventDefault();
				var val = $(this).text();
				$sel.find('.js-selected').text(val);
				if (self.graph) {
					var newOptions = self.getDrawParams({}, val);
					self.graph.updateOptions({
						y2label: val,
						file: newOptions.data,
						labels: newOptions.labels
					});
				}
			});
			$sel.find('.js-selected').text(current).end().find('ul').append(arr.join(''));
			$content.append($sel);
		}
		$(parent).append($content);
		return this.render(_params);
	},
	createNode: function () {
		return '<div id="btpgraph' + this.id + '"></div>';
	},
	setPair: function (pair) {
		this.pair = pair;
	},
	getDrawParams: function (_params, current) {
		var data = [],
			dataMap = {},
			self = this;

		if (!self.ts && !self.scale || !self.dataTime.length && !self.dataCount.length) {
			return;
		}
		

		var elem = $('#btpgraph' + self.id);
		elem.addClass('dygraph-many');
		elem.css('width', '95%').css('height', '400px');
		if (typeof(_params.css) != 'undefined') elem.css(_params.css);

		var scale = self.scale * 1000,
			now = _.now(),
			start_ts = (self.ts || now),
			dataSize = 3000;
		start_ts = (now > start_ts ? start_ts + (Math.ceil((now - start_ts) / scale) * scale) : start_ts) - (dataSize * scale);

		var props = {};
		var labels = ["N"];
		var timestamp;

		for (var i = 0; i < dataSize; i++) {
			timestamp =  (start_ts + ((i+1) * scale));
			data.push([new Date(timestamp)]);
			dataMap[i] = timestamp;
		}

		var sums = [];
		if (_params.normalize) {
			_.each(this.dataCount, function (item) {
				_.each(item, function (v, ind) {
					if (!sums[ind]) sums[ind] = 0;
					sums[ind] += v.count;
				});
			});
		}

		function addDataTime(prop, add) {
			_.each(self.dataTime, function (items, ind) {
				labels.push(self.nameTime[ind] + add);//"_ts");
				_.each(data, function (d, i) {
					var it = items[dataMap[i]];
					if (it) {
						d.push(it[prop]);//d.push(it.count == 0 ? null : it[prop]);
					} else {
						d.push(null);
					}
				});
			});
		}
		var percMap = {
			'avg': '_avg',
			'perc50': '%50',
			'perc80': '%80',
			'perc95': '%95',
			'perc99': '%99',
			'perc100': '%100'
		};
		if (this.dataCount.length == 1 && this.dataTime.length == 1) {
			addDataTime('avg', '_avg');
			addDataTime('perc50', '%50');
			addDataTime('perc80', '%80');
			addDataTime('perc95', '%95');
			addDataTime('perc99', '%99');
			//addDataTime('perc100', '%100');
			props.colors = ['#0000a0', '#800000', '#e00000', '#ff8080', '#ffb0b0', '#00a000', '#ffb757'];
			//		props.customBars = true;
		} else {
			var currentPerc = (current && current in percMap) ? current : 'perc80';
			addDataTime(currentPerc, percMap[currentPerc]);
		}
		var firstprop = null,
			cntMap = {
				'count': '_(cnt|rate)',
				'rate': '_(cnt|rate)'
			},
			currentRate = (current && current in cntMap) ? current : 'rate',
			postfix = cntMap[currentRate];
		_.each(this.dataCount, function (item, ind) {
			var i, it, v, d;
			labels.push(self.nameCount[ind] + postfix);
			if (firstprop) {
				props[self.nameCount[ind] + postfix] = {axis: firstprop };
			} else {
				props[self.nameCount[ind] + postfix] = {axis: {} };
				firstprop = self.nameCount[ind] + postfix;
			}
			if (_params.normalize) {
				for (i = 0; i < dataSize; i++) {
					it = item[dataMap[i]];
					v = it && it[currentRate];
					d = sums[i];
					data[i].push(d == null ? null : (100.0 * v / d));
				}
			} else {
				for (i = 0; i < dataSize; i++) {
					it = item[dataMap[i]];
					v = it && it[currentRate] || 0;
					data[i].push(v);//data[i].push(v == 0 ? null : v);
				}
			}
		});
		return {
			elem: elem,
			labels: labels,
			data: data,
			props: props
		}
	},
	render: function (_params) {
		var drawParams = this.getDrawParams(_params), self = this;
		
		this.graph = new Dygraph(drawParams.elem[0], drawParams.data, _.extend(drawParams.props, {
			labels: drawParams.labels,
			ylabel: this.dataTime.length ? 'time' : ' ',
			y2label: 'rate',
			stackedGraph: false,

			highlightCircleSize: 2,
			strokeWidth: 1,
			strokeBorderWidth: null,

			highlightSeriesOpts: {
				strokeWidth: 2,
				strokeBorderWidth: 1,
				highlightCircleSize: 3
			},
			zoomCallback: function (minDate, maxDate, yRange) {
				//showDimensions(minDate, maxDate, yRange);
				if (self.pair) self.pair.graph.updateOptions({
					dateWindow: [minDate, maxDate]
				});
			},
			axes: {
				y: {
					axisLabelFormatter: function (v) {
						if (!self.dataTime.length) return '';
						if (v == 0) return '';
						if (v < 100) return v + ' n';
						if (v < 500000) return (Math.round(v / 100) / 10) + ' ms';
						return Math.round(v / 100000) / 10 + ' s';
					}
				},
				y2: _.extend({
					labelsKMB: true
				}, _params.normalize ? {valueRange: [0, 100.1]} : {})
			},
			panEdgeFraction: 0.1,
			//labelsDiv: document.getElementById('status'),
			labelsDivWidth: 500,
			labelsDivStyles: {
				'background-color': 'rgba(255,0,0,0.1)' //none'
			},
			rightGap: this.dataCount.length ? 5 : 62,

			//fillGraph: true,
			//labelsSeparateLines: true,
			legend: 'always'
		}, _params.props || {}));
		//	var colors = "#FF0000,#00FF00,#0000FF,#FF00FF,#00FFFF,#000000,#70DB93,#B5A642,#5F9F9F,#B87333,#2F4F2F,#9932CD,#FFFF00,#871F78,#855E42,#545454,#8E2323,#F5CCB0,#238E23,#CD7F32,#DBDB70,#C0C0C0,#527F76,#9F9F5F,#8E236B,#2F2F4F,#EBC79E,#CFB53B,#FF7F00,#DB70DB,#D9D9F3,#5959AB,#8C1717,#238E68,#6B4226,#8E6B23,#007FFF,#00FF7F,#236B8E,#38B0DE,#DB9370,#ADEAEA,#5C4033,#4F2F4F,#CC3299,#99CC32".split(",");
		//	var colorind = 0;

	}
};
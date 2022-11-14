var Paralleler = (function () {
    function Paralleler() {
        this.reset();
    }
    Paralleler.prototype.add = function (func, func_on_result) {
        var _this = this;
        var cnt = this.counter;
        this.increment();
        func(function (result) {
            _this.data[cnt] = result;
            _this.decrement();
        });
        if (func_on_result) {
            this.finish.push(function () {
                func_on_result(arguments[cnt]);
            });
        }
        return this;
    };

    Paralleler.prototype.add_bind_obj = function (obj, func, args, func_on_result) {
        var f = function (res) {
            args.push(res);
            func.apply(obj, args);
        };
        return this.add(f, func_on_result);
    };

    Paralleler.prototype.add_bind = function (func, args, func_on_result) {
        return this.add_bind_obj(window, func, args, func_on_result);
    };

    Paralleler.prototype.increment = function () {
        this.counter++;
    };

    Paralleler.prototype.decrement = function () {
        if (this.counter >= 1) {
            this.counter--;
            if (this.counter === 0) {
                this.finishFunc();
            }
        }
    };

    Paralleler.prototype.onfinish = function (func) {
        if (this.counter > 0)
            this.finish.push(func);
        return this;
    };

    Paralleler.prototype.finishFunc = function () {
        for (var i = 0; i < this.finish.length; i++) {
            this.finish[i].apply(this, this.data);
        }
        this.reset();
    };

    Paralleler.prototype.reset = function () {
        this.counter = 0;
        this.finish = [];
        this.data = [];
    };
    return Paralleler;
})();

var paralleler = function () {
    return new Paralleler();
};

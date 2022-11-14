(function () {
    var global, p;

    global = this;

    p = null;

    describe('Paralleler', function () {
        beforeEach(function () {
            p = new global.Paralleler;
        });
        afterEach(function () {
            p != null ? p.reset() : void 0;
        });
        
        it('should be defined', function () {
            expect(global.paralleler).toBeDefined();
        });
        
        it('should have default properties', function () {
            expect(p.counter).toBe(0);
            expect(p.data).toEqual([]);
            expect(p.finish).toEqual([]);
        });
        
        it('should increase count', function () {
            expect(p.counter).toBe(0);
            p.increment();
            expect(p.counter).toBe(1);
        });
        
        it('should decrease count and call finishFunc properly', function () {
            var ff;
            ff = p.finishFunc = jasmine.createSpy('finishFunc', p.finishFunc);
            expect(p.counter).toBe(0);
            p.increment();
            p.increment();
            expect(p.counter).toBe(2);
            expect(ff.calls.count()).toEqual(0);
            p.decrement();
            expect(p.counter).toBe(1);
            expect(ff.calls.count()).toEqual(0);
            p.decrement();
            expect(p.counter).toBe(0);
            expect(ff.calls.count()).toEqual(1);
        });
        
        it('doesn\'t decrease count less then 0', function () {
            expect(p.counter).toBe(0);
            p.increment();
            expect(p.counter).toBe(1);
            p.decrement();
            p.decrement();
            p.decrement();
            expect(p.counter).toBe(0);
        });

        it('adds a function properly when just one param is passed', function () {
            p.add(function () {});
            expect(p.counter).toBe(1);
            expect(p.finish.length).toBe(0);
        });
        
        it('adds functions properly if both parameters are passed', function () {
            p.add(function() {}, function() {});
            expect(p.counter).toBe(1);
            expect(p.finish.length).toBe(1);
        });
        
        it('passes a correct result into the second function', function () {
            var data, f1, f2;
            jasmine.clock().install();
            data = {
                a: 0
            };
            f1 = function (fn) {
                setTimeout((function () {fn(data);}), 10);
            };
            f2 = function (res) {
                expect(res).toBe(data);
            };
            p.add(f1, f2);
            expect(p.counter).toBe(1);
            expect(p.finish.length).toBe(1);
            jasmine.clock().tick(20);
            expect(p.counter).toBe(0);
            expect(p.finish.length).toBe(0);
            jasmine.clock().uninstall();
        });
    });

}).call(this);

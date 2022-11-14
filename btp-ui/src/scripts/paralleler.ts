/**
 * 
 */
class Paralleler {

    counter: number;

    data: any[];

    finish: Function[];

    /**
     * 
     */
    constructor() {
        this.reset();
    }

    /**
     * 
     * @param func
     * @param [func_on_result]
     * @returns {Paralleler}
     */
    add(func: Function, func_on_result?: Function): Paralleler {
        var cnt = this.counter;
        this.increment();
        func( (result: any) => {
            this.data[cnt] = result;
            this.decrement();
        });
        if (func_on_result) {
            this.finish.push( () => {
                func_on_result(arguments[cnt]);
            });
        }
        return this;
    }

    /**
     * 
     * @param obj
     * @param func
     * @param [args]
     * @param [func_on_result]
     * @returns {Paralleler}
     */
    add_bind_obj(obj: any, func: Function, args?: any[], func_on_result?: Function): Paralleler {
        var f: Function = function (res: any) {
            args.push(res);
            func.apply(obj, args);
        };
        return this.add(f, func_on_result);
    }

    /**
     * 
     * @param func
     * @param args
     * @param func_on_result
     * @returns {Paralleler}
     */
    add_bind(func: Function, args?: any[], func_on_result?: Function): Paralleler {
       return this.add_bind_obj(window, func, args, func_on_result);
    }

    /**
     * 
     */
    increment(): void {
        this.counter++;
    }

    /**
     * 
     */
    decrement(): void {
        if (this.counter >= 1) {
            this.counter--;
            if (this.counter === 0) {
                this.finishFunc();
            }
        }
    }

    /**
     * 
     * @param func
     * @returns {Paralleler}
     */
    onfinish(func: Function): Paralleler {
        if (this.counter > 0) this.finish.push(func);
        return this;
    }

    /**
     * 
     */
    finishFunc(): void {
        for (var i = 0; i < this.finish.length; i++) {
            this.finish[i].apply(this, this.data);
        }
        this.reset();
    }
    
    reset(): void {
        this.counter = 0;
        this.finish = [];
        this.data = [];
    }
}

var paralleler = function() { return new Paralleler() };
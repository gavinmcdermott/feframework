'use strict';

var _ = require('lodash');
var Scope = require('../src/scope');
// var publishExternalAPI = require('../src/angular_public');
// var createInjector = require('../src/injector');


describe('Scope', function() {
  
  it('can be constructed and used as an object', function() {
    var scope = new Scope();
    scope.aProperty = 1;

    expect(scope.aProperty).toBe(1);
  });

  describe('digest', function() {
    
    var scope;

    beforeEach(function() {
      scope = new Scope();
    });

    it('calls the listener function of a watch on the first $digest', function() {
      var watchFn = function() { return 'wat'; };
      var listenerFn = jasmine.createSpy();
      scope.$watch(watchFn, listenerFn);

      scope.$digest();

      expect(listenerFn).toHaveBeenCalled();
    });

    it('calls the watch function with the scope as the argument', function() {
      var watchFn = jasmine.createSpy();
      var listenerFn = function() {};
      scope.$watch(watchFn, listenerFn);

      scope.$digest();

      expect(watchFn).toHaveBeenCalledWith(scope);
    });

    it('calls a listener when a watched value changes', function() {
      scope.someValue = 'a';
      scope.counter = 0;

      scope.$watch(
        function(scope) { return scope.someValue; },
        function(newVal, oldVal, scope) { scope.counter++; }
      );

      expect(scope.counter).toBe(0);

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.$digest();
      expect(scope.counter).toBe(1);
      
      scope.someValue = 'b';
      expect(scope.counter).toBe(1);

      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('calls the listener when the watch valie is first undefined', function() {
      scope.counter = 0;

      scope.$watch(
        function(scope) { return scope.someValue; },
        function(newVal, oldVal, scope) { scope.counter++; }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('calls the listener with new value as the old value the first time', function() {
      scope.someValue = 123;
      var oldValueGiven;

      scope.$watch(
        function(scope) { return scope.someValue; },
        function(newVal, oldVal, scope) { oldValueGiven = oldVal; }
      );

      scope.$digest();
      expect(oldValueGiven).toBe(123);
    });

    // We're testing the fact that you may want to be notified of the fact
    // that a digest has been run => because all watch functions are run in
    // a digest cycle, but we don't have to run their accompanying listener fns
    it('may have watchers that omit listener functions', function() {
      var watchFn = jasmine.createSpy().and.returnValue('something');
      scope.$watch(watchFn);

      scope.$digest();

      expect(watchFn).toHaveBeenCalled();
    });

    it('triggers chained watchers in the same digest', function() {
      scope.name = 'jane';

      scope.$watch(
        function(name) { return scope.nameUpper; },
        function(newVal, oldVal, scope) {
          if (newVal) {
            scope.initial = newVal.substring(0, 1) + '.';
          }
        }
      );

      scope.$watch(
        function(name) { return scope.name; },
        function(newVal, oldVal, scope) {
          if (newVal) {
            scope.nameUpper = newVal.toUpperCase();
          }
        }
      );

      scope.$digest();
      expect(scope.initial).toBe('J.');

      scope.name = 'Bob';
      scope.$digest();
      expect(scope.initial).toBe('B.');
    });

    // Ensure we kill the digest cycling if we hit an infinite loop for some reason
    it('gives up on watches if it cannot stabilize after ten rounds', function() {
      scope.counterA = 0;
      scope.counterB = 0;

      // We modify the other watches watched value in each watch function to create
      // a state where things never settle
      scope.$watch(
        function(scope) { return scope.counterA; },
        function(newVal, oldVal, scope) {
          scope.counterB++;
        }
      );

      scope.$watch(
        function(scope) { return scope.counterB; },
        function(newVal, oldVal, scope) {
          scope.counterA++;
        }
      );

      expect(function() { scope.$digest(); }).toThrow();
    });

    it('ends the digest when the last watch is clean', function() {
      scope.array = _.range(100);
      var watchExecutions = 0;

      _.times(100, function(i) {
        scope.$watch(
          function(scope) {
            watchExecutions++;
            return scope.array[i];
          },
          function(newVal, oldVal, scope) {}
        );
      });

      scope.$digest();
      expect(watchExecutions).toBe(200);

      scope.array[0] = 420;
      scope.$digest();
      expect(watchExecutions).toBe(301);
    });

    // What happens when we add a new watch from the listener of another watch
    it('does not end a digest so that new watches are not run', function() {
      scope.aValue = 123;
      scope.counter = 0;

      scope.$watch(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) {
          // add second watch in the listener function :)
          scope.$watch(
            function(scope) { return scope.aValue; },
            function(newVal, oldVal, scope) {
              scope.counter++;
            }
          );
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('compares based on value if enabled', function() {
      scope.aValue = [1,2,3];
      scope.counter = 0;

      scope.$watch(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) {
          scope.counter++;
        },
        true // pass the true flag here for deep checking
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.aValue.push(4);
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('handles NaNs correctly', function() {
      scope.number = 0/0; // NaN
      scope.counter = 0;

      scope.$watch(
        function(scope) { return scope.number; },
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('executed eval-ed functions and returns a result', function() {
      scope.aValue = 123;

      var result = scope.$eval(function(scope) {
        return scope.aValue;
      });

      expect(result).toBe(123);
    });

    it('passes the second $eval argument straight through', function() {
      scope.aValue = 123;

      var result = scope.$eval(function(scope, arg) {
        return scope.aValue + arg;
      }, 2);

      expect(result).toBe(125);
    });

    it('executes apply-ed functions and starts a digest', function() {
      scope.aValue = 'someValue';
      scope.counter = 0;

      scope.$watch(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);
      
      scope.$apply(function(scope) {
        scope.aValue = 'someOtherValue';
      });
      expect(scope.counter).toBe(2);
    });

    it('executes $evalAsync-ed functions later in the SAME digest cycle', function() {
      scope.aValue = [1,2,3];
      scope.asyncEvaluated = false;
      scope.asyncEvaluatedImmediately = false;

      scope.$watch(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) {
          // set up the async eval statement to be run later
          scope.$evalAsync(function(scope) {
            scope.asyncEvaluated = true;
          });
          scope.asyncEvaluatedImmediately = scope.asyncEvaluated;
        }
      );

      scope.$digest();
      expect(scope.asyncEvaluated).toBe(true);
      expect(scope.asyncEvaluatedImmediately).toBe(false);
    });

    it('executes $evalAsync-ed functions added in watch functions', function() {
      scope.aValue = [1,2,3];
      scope.asyncEvaluated = false;

      scope.$watch(
        function(scope) {
          if (!scope.asyncEvaluated) {
            scope.$evalAsync(function(scope) {
              scope.asyncEvaluated = true;
            });
          }  
          return scope.aValue;
        },
        function() {}
      );

      scope.$digest();
      expect(scope.asyncEvaluated).toBe(true);
    });

    it('executes $evalAsync-ed functions even when not dirty', function() {
      scope.aValue = [1,2,3];
      scope.asyncEvaluatedTimes = 0;

      scope.$watch(
        function(scope) {
          // ensure that the digest loop is also checking for items in the
          // async queue that are added in watch functions :)
          if (scope.asyncEvaluatedTimes < 2) {
            scope.$evalAsync(function(scope) {
              scope.asyncEvaluatedTimes++;
            });
          }  
          return scope.aValue;
        },
        function() {}
      );

      scope.$digest();
      expect(scope.asyncEvaluatedTimes).toBe(2);
    });

    it('eventually halts evalAsyncs added by watches', function() {
      scope.aValue = [1,2,3];

      scope.$watch(
        function(scope) {
          scope.$evalAsync(function(scope) {});
          return scope.aValue;
        },
        function() {}
      );

      expect(function() { scope.$digest(); }).toThrow();
    });

    it('has a $$phase field whose value represents the current digest phase', function() {
      scope.aValue = [1,2,3];
      scope.phaseInWatchFn = undefined;
      scope.phaseInListenerFn = undefined;
      scope.phaseInApplyFn = undefined;

      scope.$watch(
        function(scope) {
          scope.phaseInWatchFn = scope.$$phase;
          return scope.aValue;
        },
        function(newVal, oldVal, scope) {
          scope.phaseInListenerFn = scope.$$phase;
        }
      );

      scope.$apply(function(scope) {
        scope.phaseInApplyFn = scope.$$phase;
      });

      expect(scope.phaseInWatchFn).toBe('$digest');
      expect(scope.phaseInListenerFn).toBe('$digest');
      expect(scope.phaseInApplyFn).toBe('$apply');
    });

    it('schedules a digest in evalAsync', function(done) {
      scope.aValue = '123';
      scope.counter = 0;

      scope.$watch(
        function(scope) {return scope.aValue;},
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$evalAsync(function(scope) {});

      expect(scope.counter).toBe(0);
      setTimeout(function() {
        expect(scope.counter).toBe(1);
        done();
      }, 50);
    });

    it('allows async $apply with $applyAsync', function(done) {
      scope.counter = 0;

      scope.$watch(
        function(scope) {return scope.aValue;},
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.$applyAsync(function(scope) {
        scope.aValue = 123;
      });
      expect(scope.counter).toBe(1);

      setTimeout(function() {
        expect(scope.counter).toBe(2);
        done();
      }, 50);
    });

    // important distinction between $evalAsync and $applyAsync
    // $evalAsync   : runs the function in the current digest if one is going
    // $applyAsync  : always schedules the function to be run async
    it('never executes $applyAsync-ed functions in the same digest cycle', function(done) {
      scope.aValue = 123;
      scope.asyncApplied = false;

      scope.$watch(
        function(scope) {return scope.aValue;},
        function(newVal, oldVal, scope) {
          scope.$applyAsync(function(scope) {
            scope.asyncApplied = true;
          });
        }
      );

      scope.$digest();
      expect(scope.asyncApplied).toBe(false);

      setTimeout(function() {
        expect(scope.asyncApplied).toBe(true);
        done();
      }, 50);
    });

    it('coalesces many calls to $applyAsync', function(done) {
      scope.counter = 0;

      scope.$watch(
        function(scope) {
          scope.counter++;
          return scope.aValue;
        },
        function(newVal, oldVal, scope) {}
      );

      scope.$applyAsync(function(scope) {
        scope.aValue = '123';
      });

      scope.$applyAsync(function(scope) {
        scope.aValue = '456';
      });

      setTimeout(function() {
        expect(scope.counter).toBe(2);
        done();
      }, 50);
    });

    it('cancels and flushes $applyAsync if digested first', function(done) {
      scope.counter = 0;

      scope.$watch(
        function(scope) {
          scope.counter++;
          return scope.aValue;
        },
        function(newVal, oldVal, scope) {}
      );

      scope.$applyAsync(function(scope) {
        scope.aValue = '123';
      });

      scope.$applyAsync(function(scope) {
        scope.aValue = '456';
      });

      scope.$digest();
      expect(scope.counter).toBe(2);
      expect(scope.aValue).toBe('456');

      setTimeout(function() {
        expect(scope.counter).toBe(2);
        done();
      }, 50);
    });

    // Post digest
    it('runs a $$postDigest after each digest', function() {
      scope.counter = 0;

      scope.$$postDigest(function() {
        scope.counter++;
      });

      expect(scope.counter).toBe(0);

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('does not include $$postDigest in the regular digest', function() {
      scope.aValue = 'originalValue';

      scope.$$postDigest(function() {
        scope.aValue = 'newVal';
      });

      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newVal, oldVal, scope) {
          scope.watchedValue = newVal;
        }
      );

      scope.$digest();
      expect(scope.watchedValue).toBe('originalValue');

      scope.$digest();
      expect(scope.watchedValue).toBe('newVal');      
    });

    it('catches exceptions in watch functions and continues', function() {
      scope.aValue = 123;
      scope.counter = 0;

      scope.$watch(
        function(scope) { throw new Error('Foo!'); },
        function(newVal, oldVal, scope) {}
      );
      
      scope.$watch(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) { scope.counter++; }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('catches exceptions in listener functions and continues', function() {
      scope.aValue = 123;
      scope.counter = 0;

      scope.$watch(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) {
          throw new Error('Foo!');
        }
      );
      
      scope.$watch(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) { scope.counter++; }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('catches exceptions in $evalAsync', function(done) {
      scope.aValue = 123;
      scope.counter = 0;
      
      scope.$watch(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) { scope.counter++; }
      );

      scope.$evalAsync(function(scope) {
        throw new Error('Blah');
      });

      setTimeout(function() {
        expect(scope.counter).toBe(1);
        done();
      });
    });

    it('catches exceptions in $applyAsync', function(done) {
      scope.$applyAsync(function(scope) {
        throw new Error('Foo');
      });

      scope.$applyAsync(function(scope) {
        throw new Error('Foo');
      });

      scope.$applyAsync(function(scope) {
        scope.applied = true;
      });

      setTimeout(function() {
        expect(scope.applied).toBe(true);
        done();
      });
    });

    it('catches exceptions in $$postDigest', function() {
      var didRun = false;

      scope.$$postDigest(function() {
        throw new Error('Foo');
      });

      scope.$$postDigest(function() {
        didRun = true;
      });

      scope.$digest();
      expect(didRun).toBe(true);
    });

    it('allows destroying a $watch with a removal function', function() {
      scope.aValue = 'abc';
      scope.counter = 0;

      var destroyWatch = scope.$watch(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) { scope.counter++; }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.aValue = 'def';
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.aValue = 'ghi';
      // Boom goes the dynamite
      destroyWatch();
      scope.$digest();
      expect(scope.counter).toBe(2);      
    });

    it('allows destroying a $watch during a digest', function() {
      scope.aValue = 123;

      var watchCalls = [];

      scope.$watch(
        function(scope) {
          watchCalls.push('first');
          return scope.aValue;
        }
      );

      var destroyWatch = scope.$watch(
        function(scope) {
          watchCalls.push('second');
          destroyWatch();
        }
      );

      scope.$watch(
        function(scope) {
          watchCalls.push('third');
          return scope.aValue;
        }
      );

      scope.$digest();
      expect(watchCalls).toEqual(['first','second','third','first','third']);
    });

    // The first watch is executed. It is dirty, so it is stored in $$lastDirtyWatch 
    // and its listener is executed. The listener destroys the second watch.
    // The first watch is executed again, because it has moved one position down in the
    // watcher array. This time it is clean, and since it is also in $$lastDirtyWatch,
    // the digest ends. We never get to the third watch.
    it('allows a $watch to destroy another during a digest', function() {
      var destroyWatch;

      scope.aValue = 123;
      scope.counter = 0;

      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newVal, oldVal, scope) {
          destroyWatch();
        }
      );

      destroyWatch = scope.$watch(
        function(scope) {},
        function(newVal, oldVal, scope) {}
      );

      scope.$watch(
        function(scope) {
          return scope.aValue;
        },
        function(newVal, oldVal, scope) { scope.counter++; }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('allows destroying several $watches during a digest', function() {
      var destroyWatchA;
      var destroyWatchB;

      scope.aValue = 123;
      scope.counter = 0;

      destroyWatchA = scope.$watch(
        function(scope) {
          destroyWatchA();
          destroyWatchB();
        }
      );

      destroyWatchB = scope.$watch(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) { 
          scope.counter++; }
      );

      scope.$digest();
      expect(scope.counter).toBe(0);
    });
  });

  describe('$watchGroup', function() {
    
    var scope;

    beforeEach(function() {
      scope = new Scope();
    });

    it('takes watches as an array and calls listeners with arrays', function() {
      var gotNewValues, gotOldValues;

      scope.aValue = 1;
      scope.anotherValue = 2;

      scope.$watchGroup(
        [
          function(scope) { return scope.aValue; },
          function(scope) { return scope.anotherValue; }
        ],
        function(newValues, oldValues, scope) {
          gotNewValues = newValues;
          gotOldValues = oldValues;
        }
      );

      scope.$digest();
      expect(gotNewValues).toEqual([1, 2]);
      expect(gotOldValues).toEqual([1, 2]);
    });

    it('only calls listener once per digest', function() {
      var counter = 0;

      scope.aValue = 1;
      scope.anotherValue = 2;

      scope.$watchGroup(
        [
          function(scope) { return scope.aValue; },
          function(scope) { return scope.anotherValue; }
        ],
        function(newValues, oldValues, scope) {
          counter++;
        }
      );

      scope.$digest();
      expect(counter).toBe(1);
    });

    it('uses the same array of old and new values on first run', function() {
      var gotNewValues, gotOldValues;

      scope.aValue = 1;
      scope.anotherValue = 2;

      scope.$watchGroup(
        [
          function(scope) { return scope.aValue; },
          function(scope) { return scope.anotherValue; }
        ],
        function(newValues, oldValues, scope) {
          gotNewValues = newValues;
          gotOldValues = oldValues;
        }
      );

      scope.$digest();
      expect(gotNewValues).toBe(gotOldValues);
    });

    it('uses different arrays for old and new values on subsequent runs', function() {
      var gotNewValues, gotOldValues;

      scope.aValue = 1;
      scope.anotherValue = 2;

      scope.$watchGroup(
        [
          function(scope) { return scope.aValue; },
          function(scope) { return scope.anotherValue; }
        ],
        function(newValues, oldValues, scope) {
          gotNewValues = newValues;
          gotOldValues = oldValues;
        }
      );

      scope.$digest();

      scope.anotherValue = 3;
      scope.$digest();

      expect(gotNewValues).toEqual([1, 3]);
      expect(gotOldValues).toEqual([1, 2]);
    });

    it('calls the listener exactly once when the watch array is empty', function() {
     var gotNewValues, gotOldValues;

      scope.$watchGroup(
        [],
        function(newValues, oldValues, scope) {
          gotNewValues = newValues;
          gotOldValues = oldValues;
        }
      );

      scope.$digest();

      expect(gotNewValues).toEqual([]);
      expect(gotOldValues).toEqual([]);
    });

    it('can be deregistered', function() {
     var counter = 0;

     scope.aValue = 1;
     scope.anotherValue = 2;

      var destroyGroup = scope.$watchGroup(
        [
          function(scope) { return scope.aValue; },
          function(scope) { return scope.anotherValue; }
        ],
        function(newValues, oldValues, scope) {
          counter++;
        }
      );

      scope.$digest();    

      scope.anotherValue = 3;
      destroyGroup();  
      scope.$digest();

      expect(counter).toEqual(1);
    });

    it('does not call the zero-watch listener when deregistered first', function() {
      var counter = 0;

      var destroyGroup = scope.$watchGroup(
        [], function(oldValues, newValues, scope) {
          counter++;
        }
      );

      destroyGroup();
      scope.$digest();

      expect(counter).toEqual(0);
    });
  });

  describe('inheritance', function() {
    
    it('child inherits the parent\'s properties', function() {
      var parent = new Scope();
      parent.aValue = [1,2,3];

      var child = parent.$new();

      expect(child.aValue).toEqual([1,2,3]);
    });

    it('does not cause a parent to inherit a child\'s properties', function() {
      var parent = new Scope();

      var child = parent.$new();
      child.aValue = [1,2,3];

      expect(parent.aValue).toBeUndefined();
    });

    it('inherits a parent\'s properties whenever they are defined', function() {
      var parent = new Scope();
      var child = parent.$new();
      
      parent.aValue = [1,2,3];

      expect(child.aValue).toEqual([1,2,3]);
    });

    it('can manipulate a parent scope\'s property', function() {
      var parent = new Scope();
      var child = parent.$new();
      parent.aValue = [1,2,3];
      
      child.aValue.push(4);

      expect(parent.aValue).toEqual([1,2,3,4]);
      expect(child.aValue).toEqual([1,2,3,4]);
    });

    it('can watch a property in the parent', function() {
      var parent = new Scope();
      var child = parent.$new();
      parent.aValue = [1,2,3];
      child.counter = 0;

      child.$watch(
        function(scope) { return parent.aValue; },
        function(newVal, oldVal, scope) {
          scope.counter++;
        },
        true
      );

      child.$digest();
      expect(child.counter).toBe(1);
      
      parent.aValue.push(4);
      child.$digest();
      expect(child.counter).toBe(2);
    });

    // basically, a child scope's parent is made its prototype
    it('can be nested at any depth', function() {
      var a     = new Scope();
      var aa    = a.$new();
      var aaa   = aa.$new();
      var aab   = aa.$new();
      var ab    = a.$new();
      var abb   = ab.$new();

      a.value = 1;

      expect(aa.value).toBe(1);
      expect(aaa.value).toBe(1);
      expect(aab.value).toBe(1);
      expect(ab.value).toBe(1);
      expect(abb.value).toBe(1);

      ab.anotherValue = 2;

      expect(ab.anotherValue).toBe(2);
      expect(abb.anotherValue).toBe(2);
      expect(aa.anotherValue).toBeUndefined();
      expect(aaa.anotherValue).toBeUndefined();
      expect(aab.anotherValue).toBeUndefined();
    });

    it('shadows a parent\'s property with the same name', function() {
      var parent = new Scope();
      var child = parent.$new();

      parent.name = 'jim';
      child.name = 'jill';

      expect(child.name).toBe('jill');
      expect(parent.name).toBe('jim');
    });

    // but we can mutate the contents of an object
    it('does not shadow members of a parent scope\'s attributes', function() {
      var parent = new Scope();
      var child = parent.$new();

      parent.user = { name: 'jim' };
      child.user.name = 'jill';

      expect(child.user.name).toBe('jill');
      expect(parent.user.name).toBe('jill');
    });

    it('does not digest its parents', function() {
      var parent = new Scope();
      var child = parent.$new();

      parent.aValue = '123';
      parent.$watch(
        function(scope) {return scope.aValue;},
        function(newVal, oldVal, scope) {
          scope.aValueWas = newVal;
        }
      );

      child.$digest();
      expect(parent.aValueWas).toBeUndefined();
    });

    it('keeps a record of its children', function() {
      var parent    = new Scope();
      var child1    = parent.$new();      
      var child2    = parent.$new();      
      var child2_1  = child2.$new();

      expect(parent.$$children.length).toBe(2);
      expect(parent.$$children[0]).toBe(child1);
      expect(parent.$$children[1]).toBe(child2);
      
      expect(child1.$$children.length).toBe(0);

      expect(child2.$$children.length).toBe(1);
      expect(child2.$$children[0]).toBe(child2_1);
    });

    it('digests its children', function() {
      var parent = new Scope();
      var child = parent.$new();

      parent.aValue = '123';
      child.$watch(
        function(scope) {return scope.aValue;},
        function(newVal, oldVal, scope) {
          scope.aValueWas = newVal;
        }
      );

      parent.$digest();
      expect(child.aValueWas).toBe('123');
    });

    it('digests from the root on $apply', function() {
      var parent = new Scope();
      var child = parent.$new();
      var child2 = child.$new();

      parent.aValue = '123';
      parent.counter = 0;

      parent.$watch(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      child2.$apply(function() {});

      expect(parent.counter).toBe(1);
    });

    it('digests from the root on $evalAsync', function(done) {
      var parent = new Scope();
      var child = parent.$new();
      var child2 = child.$new();

      parent.aValue = '123';
      parent.counter = 0;

      parent.$watch(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      child2.$evalAsync(function() {});

      setTimeout(function() {
        expect(parent.counter).toBe(1);
        done();
      }, 50);
    });

    it('does not have access to parent attributes when isolated', function() {
      var parent = new Scope();
      var child = parent.$new(true);

      parent.aValue = 123;

      expect(child.aValue).toBeUndefined();
    });

    it('cannot watch parent attributes when isolated', function() {
      var parent = new Scope();
      var child = parent.$new(true);

      parent.aValue = 123;
      child.$watch(
        function(scope) {return scope.aValue;},
        function(newVal, oldVal, scope) {
          scope.aValueWas = newVal;
        }
      );

      child.$digest();
      expect(child.aValueWas).toBeUndefined();
    });


    it("digests its isolated children", function() {
      var parent = new Scope();
      var child = parent.$new(true);
      child.aValue = 'abc';
      
      child.$watch(
        function(scope) { return scope.aValue; },
        function(newValue, oldValue, scope) {
          scope.aValueWas = newValue;
        }
      );
      
      parent.$digest();
      expect(child.aValueWas).toBe('abc');
    });

    // if calling apply from an isolated child, we'll want to run a root digest
    it("digests from root on $apply when isolated", function() {
      var parent = new Scope();
      var child = parent.$new(true);
      var child2 = child.$new();
      
      parent.aValue = 'abc';
      parent.counter = 0;
      
      parent.$watch(
        function(scope) { return scope.aValue; },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      
      child2.$apply(function() {});
      expect(parent.counter).toBe(1);
    });

    it("schedules a digest from root on $evalAsync when isolated", function(done) {
      var parent = new Scope();
      var child = parent.$new(true);
      var child2 = child.$new();
      
      parent.aValue = 'abc';
      parent.counter = 0;
      
      parent.$watch(
        function(scope) { return scope.aValue; },
        function(newValue, oldValue, scope) {
          scope.counter++;
        }
      );
      
      child2.$evalAsync(function() {});

      setTimeout(function() {
        expect(parent.counter).toBe(1);
        done();
      }, 50);
    });

    it('executes $evalAsync functions on isolated scopes', function(done) {
      var parent = new Scope();
      var child = parent.$new(true);
      
      child.$evalAsync(function(scope) {
        scope.didEvalAsync = true;
      });

      setTimeout(function() {
        expect(child.didEvalAsync).toBe(true);
        done();
      }, 50);
    });

    it('executes $postDigest functions on isolated scopes', function() {
      var parent = new Scope();
      var child = parent.$new(true);
      
      child.$$postDigest(function() {
        child.didPostDigest = true;
      });
      parent.$digest();

      expect(child.didPostDigest).toBe(true);
    });

    it('can take some other scope as the parent', function() {
      var prototypeParent = new Scope();
      var heirarchyParent = new Scope();
      var child = prototypeParent.$new(false, heirarchyParent);

      prototypeParent.a = 42;
      expect(child.a).toBe(42);

      child.counter = 0;
      child.$watch(
        function(scope) {
          scope.counter++;
        }
      );

      prototypeParent.$digest();
      expect(child.counter).toBe(0);

      heirarchyParent.$digest();
      expect(child.counter).toBe(2);
    });

    it('is no longer digested when $destroy has been called', function() {
      var parent = new Scope();
      var child = parent.$new();
      
      child.aValue = [1,2,3];
      child.counter = 0;
      
      child.$watch(
        function(scope) { return scope.aValue; },
        function(newValue, oldValue, scope) {
          scope.counter++;
        },
        true
      );

      parent.$digest();
      expect(child.counter).toBe(1);

      child.aValue.push(4);
      parent.$digest();
      expect(child.counter).toBe(2);

      child.$destroy();
      child.aValue.push(5);
      parent.$digest();
      expect(child.counter).toBe(2);
    });
  });

  // purpose is to watch arrays and objects
  describe('$watchCollection', function() {
      
    var scope;

    beforeEach(function() {
      scope = new Scope();
    });

    it('works like a normal watch for non-collections', function() {
      var valueProvided;

      scope.aValue = 42;
      scope.counter = 0;

      scope.$watchCollection(
        function(scope) {return scope.aValue;},
        function(newVal, oldVal, scope) {
          valueProvided = newVal;
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);
      expect(valueProvided).toBe(scope.aValue);

      scope.aValue = 43;
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('works like a normal watch for NaNs', function() {
      scope.aValue = 0/0;
      scope.counter = 0;

      scope.$watchCollection(
        function(scope) {return scope.aValue;},
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('notices when the value becomes an array', function() {
      scope.counter = 0;

      scope.$watchCollection(
        function(scope) { return scope.arr; },
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.arr = [1,2,3];
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices an item added to an array', function() {
      scope.arr = [1,2,3];
      scope.counter = 0;

      scope.$watchCollection(
        function(scope) {return scope.arr;},
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.arr.push(4);
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices an item removed from an array', function() {
      scope.arr = [1,2,3];
      scope.counter = 0;

      scope.$watchCollection(
        function(scope) {return scope.arr;},
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.arr.shift();
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices an item replaced in an array', function() {
      scope.arr = [1,2,3];
      scope.counter = 0;

      scope.$watchCollection(
        function(scope) {return scope.arr;},
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.arr[1] = 42;
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices items reordered in an array', function() {
      scope.arr = [1,3,2];
      scope.counter = 0;

      scope.$watchCollection(
        function(scope) {return scope.arr;},
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.arr.sort();
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('does not fail on NaN in an array', function() {
      scope.arr = [1, NaN, 3];
      scope.counter = 0;

      scope.$watchCollection(
        function(scope) {return scope.arr;},
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    // Let's handle array-like objects!
    // arguments to a function
    it('notices an item replaced in an arguments object', function() {
      (function() {
        scope.arrayLike = arguments;
      })(1, 2, 3);
      scope.counter = 0;

      scope.$watchCollection(
        function(scope) {return scope.arrayLike;},
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.arrayLike[1] = 42;
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    // DOM node lists (e.g.: querySelectorAll, getElementsByTagName)
    it('notices an item replaced in a NodeList object', function() {
      document.documentElement.appendChild(document.createElement('div'));
      // this is a Live collection and is immediately updated with any changes
      // made
      scope.arrayLike = document.getElementsByTagName('div');
      scope.counter = 0;

      scope.$watchCollection(
        function(scope) {return scope.arrayLike;},
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      document.documentElement.appendChild(document.createElement('div'));
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices when the value becomes an object', function() {
      scope.counter = 0;

      scope.$watchCollection(
        function(scope) { return scope.obj; },
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.obj = { a:1 };
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices when an attribute is added to an object', function() {
      scope.counter = 0;
      scope.obj = {a:1};

      scope.$watchCollection(
        function(scope) { return scope.obj; },
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.obj.b = 2;
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('notices when an attribute value is changed in an object', function() {
      scope.counter = 0;
      scope.obj = {a:1};

      scope.$watchCollection(
        function(scope) { return scope.obj; },
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.obj.a = 2;
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    it('does not fail on NaN attributes in an object', function() {
      scope.counter = 0;
      scope.obj = {a: NaN};

      scope.$watchCollection(
        function(scope) { return scope.obj; },
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);
    });

    it('notices when an attribute is removed from an object', function() {
      scope.counter = 0;
      scope.obj = {a:1};

      scope.$watchCollection(
        function(scope) { return scope.obj; },
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      delete scope.obj.a;
      scope.$digest();
      expect(scope.counter).toBe(2);

      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    // handle the tricky case of an object having a 'length' property
    it('does not consider an object with a length property an array', function() {
      scope.obj = {a:1, length: 123};
      scope.counter = 0;

      scope.$watchCollection(
        function(scope) { return scope.obj; },
        function(newVal, oldVal, scope) {
          scope.counter++;
        }
      );

      scope.$digest();
      expect(scope.counter).toBe(1);

      scope.obj.a = 2;
      scope.$digest();
      expect(scope.counter).toBe(2);
    });

    // Since we maintain the old value in the internal watch function,
    // it will have already been updated to the new value by the time the
    // listener is invoked...so we test the successful handling of old values here
    it('gives the old non-collection value to listeners', function() {
      var oldValueGiven;
      scope.aValue = 123;
      
      scope.$watchCollection(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) {
          oldValueGiven = oldVal;
        }
      );

      scope.$digest();

      scope.aValue = 1234;
      scope.$digest();

      expect(oldValueGiven).toBe(123);      
    });

    it('gives the old array value to listeners', function() {
      var oldValueGiven;
      scope.aValue = [1,2,3];

      scope.$watchCollection(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) {
          oldValueGiven = oldVal;
        }
      );

      scope.$digest();

      scope.aValue.push(4);
      scope.$digest();

      expect(oldValueGiven).toEqual([1,2,3]);      
    });

    it('gives the old object value to listeners', function() {
      var oldValueGiven;
      scope.aValue = {a:1};

      scope.$watchCollection(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) {
          oldValueGiven = oldVal;
        }
      );

      scope.$digest();

      scope.aValue.a = 2;
      scope.$digest();

      expect(oldValueGiven).toEqual({a:1});      
    });

    it('uses the new value as the old value on the first digest', function() {
      var oldValueGiven;
      scope.aValue = {a:1};

      scope.$watchCollection(
        function(scope) { return scope.aValue; },
        function(newVal, oldVal, scope) {
          oldValueGiven = oldVal;
        }
      );

      scope.$digest();

      expect(oldValueGiven).toEqual({a:1}); 
    });
  });

  describe('Events', function() {
    
    var scope;
    var parent;
    var child;
    var isolatedChild;

    beforeEach(function() {
      parent = new Scope();
      scope = parent.$new();
      child = scope.$new();
      isolatedChild = scope.$new(true);
    });

    it('allows registering listeners', function() {
      var listener1 = function() {};
      var listener2 = function() {};
      var listener3 = function() {};

      scope.$on('eventA', listener1);
      scope.$on('eventA', listener2);
      scope.$on('eventB', listener3);

      expect(scope.$$listeners).toEqual({
        eventA: [listener1, listener2],
        eventB: [listener3]
      });
    });

    it('registers different listeners for every scope', function() {
      var listener1 = function() {};
      var listener2 = function() {};
      var listener3 = function() {};

      scope.$on('eventA', listener1);
      child.$on('eventA', listener2);
      isolatedChild.$on('eventB', listener3);

      expect(scope.$$listeners).toEqual({ eventA: [listener1] });
      expect(child.$$listeners).toEqual({ eventA: [listener2] });
      expect(isolatedChild.$$listeners).toEqual({ eventB: [listener3] });
    });

    // Broadcast and Emit tests
    _.forEach(['$emit', '$broadcast'], function(method) {
      
      it(method.toUpperCase() + ': calls the listeners of the matching event on ' + method, function() {
        var listener1 = jasmine.createSpy();
        var listener2 = jasmine.createSpy();

        scope.$on('eventA', listener1);
        scope.$on('eventB', listener2);
        
        scope[method]('eventA');

        expect(listener1).toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
      });

      it(method.toUpperCase() + ': passes and event object with a name to listeners on ' + method, function() {
        var listener1 = jasmine.createSpy();
        scope.$on('eventA', listener1);
        
        scope[method]('eventA');

        expect(listener1).toHaveBeenCalled();
        expect(listener1.calls.mostRecent().args[0].name).toEqual('eventA');
      });

      it(method.toUpperCase() + ': passes the same event object to listeners on ' + method, function() {
        var listener1 = jasmine.createSpy();
        var listener2 = jasmine.createSpy();

        scope.$on('eventA', listener1);
        scope.$on('eventA', listener2);
        
        scope[method]('eventA');

        var event1 = listener1.calls.mostRecent().args[0];
        var event2 = listener2.calls.mostRecent().args[0];
        
        expect(event1).toBe(event2);
      });

      it(method.toUpperCase() + ': passes additional arguments to listeners on ' + method, function() {
        var listener1 = jasmine.createSpy();
        scope.$on('eventA', listener1);
        
        scope[method]('eventA', 'and', ['additional', 'args'], '...');

        expect(listener1.calls.mostRecent().args[1]).toEqual('and');
        expect(listener1.calls.mostRecent().args[2]).toEqual(['additional', 'args']);
        expect(listener1.calls.mostRecent().args[3]).toEqual('...');
      });

      it(method.toUpperCase() + ': returns the event object on ' + method, function() {
        var returnedEvent = scope[method]('eventA');

        expect(returnedEvent).toBeDefined();
        expect(returnedEvent.name).toEqual('eventA');
      });

      it(method.toUpperCase() + ': can be deregistered', function() {
        var listener = jasmine.createSpy();
        var deregister = scope.$on('eventA');

        deregister();

        scope[method]('eventA');

        expect(listener).not.toHaveBeenCalled();
      });

      it(method.toUpperCase() + ': does not skip the next listener when removed on ' + method, function() {
        var deregister;

        var listener = function() {
          deregister();
        };
        var nextListener = jasmine.createSpy();
        
        deregister = scope.$on('eventA', listener);
        scope.$on('eventA', nextListener);

        scope[method]('eventA');

        expect(nextListener).toHaveBeenCalled();
      });

      it(method.toUpperCase() + ': sets defaultPrevented when preventDefault is called on ' + method, function() {
        var listener = function(event) {
          event.preventDefault();
        };
        
        scope.$on('eventA', listener);

        var event =scope[method]('eventA');
        
        expect(event.defaultPrevented).toBe(true);
      });

      // visual separation in the test UI
      it('================', function() {});
    });

    // less expensive because it goes directly up the scope chain vertically
    it('propagates up the scope heirarchy on $emit', function() {
      var parentListener = jasmine.createSpy();
      var scopeListener = jasmine.createSpy();

      parent.$on('eventA', parentListener);
      scope.$on('eventA', scopeListener);

      scope.$emit('eventA');

      expect(scopeListener).toHaveBeenCalled();
      expect(parentListener).toHaveBeenCalled();
    });

    // more expensive because of traversal across all children
    it('propagates down the scope heirarchy on $broadcast', function() {
      var scopeListener = jasmine.createSpy();
      var childListener = jasmine.createSpy();
      var isolatedChildListener = jasmine.createSpy();

      scope.$on('eventA', scopeListener);
      child.$on('eventA', childListener);
      isolatedChild.$on('eventA', isolatedChildListener);

      scope.$broadcast('eventA');

      expect(scopeListener).toHaveBeenCalled();
      expect(childListener).toHaveBeenCalled();
      expect(isolatedChildListener).toHaveBeenCalled();
    });

    it('propagates the same event down on $broadcast', function() {
      var scopeListener = jasmine.createSpy();
      var childListener = jasmine.createSpy();

      scope.$on('eventA', scopeListener);
      child.$on('eventA', childListener);

      scope.$broadcast('eventA');

      var scopeEvent = scopeListener.calls.mostRecent().args[0];
      var childEvent = childListener.calls.mostRecent().args[0];
      expect(scopeEvent).toBe(childEvent);
    });

    it('attaches targetScope on $emit', function() {
      var scopeListener = jasmine.createSpy();
      var parentListener = jasmine.createSpy();

      scope.$on('eventA', scopeListener);
      parent.$on('eventA', parentListener);

      scope.$emit('eventA');

      expect(scopeListener.calls.mostRecent().args[0].targetScope).toBe(scope);
      expect(parentListener.calls.mostRecent().args[0].targetScope).toBe(scope);
    });

    it('attaches targetScope on $broadcast', function() {
      var scopeListener = jasmine.createSpy();
      var childListener = jasmine.createSpy();

      scope.$on('eventA', scopeListener);
      child.$on('eventA', childListener);

      scope.$broadcast('eventA');

      expect(scopeListener.calls.mostRecent().args[0].targetScope).toBe(scope);
      expect(childListener.calls.mostRecent().args[0].targetScope).toBe(scope);
    });

    it('attaches currentScope on $emit', function() {
      var currentScopeOnScope, currentScopeOnParent;

      // we can only verify invocations after the fact with Jasmine spies,
      // and since currentScope is mutated during the scope traversal, we 
      // must record its momentary value exactly when the listener is called
      // So, we'll use local variables to track this
      var scopeListener = function(event) {
        currentScopeOnScope = event.currentScope;
      };
      
      var parentListener = function(event) {
        currentScopeOnParent = event.currentScope;
      };

      scope.$on('eventA', scopeListener);
      parent.$on('eventA', parentListener);

      scope.$emit('eventA');

      expect(currentScopeOnScope).toBe(scope);
      expect(currentScopeOnParent).toBe(parent);
    });

    it('attaches currentScope on $broadcast', function() {
      var currentScopeOnScope, currentScopeOnChild;

      var scopeListener = function(event) {
        currentScopeOnScope = event.currentScope;
      };
      
      var childListener = function(event) {
        currentScopeOnChild = event.currentScope;
      };

      scope.$on('eventA', scopeListener);
      child.$on('eventA', childListener);

      scope.$broadcast('eventA');

      expect(currentScopeOnScope).toBe(scope);
      expect(currentScopeOnChild).toBe(child);
    });

    // note: you cannot stop propagation on $broadcast -- it's expensive!
    it('does not propagate events to parents when stopped (only on emit)', function() {
       var scopeListener = function(event) {
        event.stopPropagation();
      };
      
      var parentListener = jasmine.createSpy();     

      scope.$on('eventA', scopeListener);
      parent.$on('eventA', parentListener);

      scope.$emit('eventA');

      expect(parentListener).not.toHaveBeenCalled();
    });

    // even after stopping propagation, all sibling scopes should fire their listners
    it('is received by listeners on the current scope after being stopped', function() {
       var listener1 = function(event) {
        event.stopPropagation();
      };
      
      var listener2 = jasmine.createSpy();     

      scope.$on('eventA', listener1);
      scope.$on('eventA', listener2);

      scope.$emit('eventA');

      expect(listener2).toHaveBeenCalled();
    });

    it('fires $destroy when destroyed', function() {
      var listener = jasmine.createSpy();
      scope.$on('$destroy', listener);

      scope.$destroy();

      expect(listener).toHaveBeenCalled();
    });

    it('fires $destroy on all children destroyed', function() {
      var childListener = jasmine.createSpy();
      child.$on('$destroy', childListener);

      // destroy the parent
      scope.$destroy();

      expect(childListener).toHaveBeenCalled();
    });




  });








});




























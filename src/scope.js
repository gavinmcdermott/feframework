'use strict';

var _ = require('lodash');

var PHASES = {
  DIGEST: '$digest',
  APPLY: '$apply'
};

// We need this value to be guaranteed unique at run-time,
// and since JS functions are reference values (not considered)
// equal to anything but themselves - use this value to initialize
// a non-null or not-undefined value in the watchers
var initWatchVal = function() {};

function isArrayLike(obj) {
  if (_.isNull(obj) || _.isUndefined(obj)) {
    return false;
  }
  var length = obj.length;
  return length === 0 ||
    (_.isNumber(length) && length > 0 && (length - 1) in obj);
}

function Scope() {
  this.$$watchers = [];
  this.$$lastDirtyWatch = null;
  // store any jobs scheduled to run in the current/near term digest loop
  this.$$asyncQueue = [];
  // store any jobs schedules to be run asynchronously
  this.$$applyAsyncQueue = [];
  this.$$applyAsyncId = null;
  this.$$postDigestQueue = [];
  // track the scope's listeners here for event propagation
  this.$$listeners = {};
  // current phase of the scope
  this.$$phase = null;
  // Keep track of the scope's children created
  this.$$children = [];
  
  this.$root = this;
}

Scope.prototype.$new = function(isolated, parent) {
  var child;

  parent = parent || this;

  if (isolated) {
    child = new Scope();

    child.isIsolate = true;

    // we want each scope in the heirarchy to share the same copy of
    // each one of these attributes
    child.$root = parent.$root;
    child.$$asyncQueue = parent.$$asyncQueue;
    child.$$postDigestQueue = parent.$$postDigestQueue;
    child.$$applyAsyncQueue = parent.$$applyAsyncQueue;
  } else {
    var ChildScope = function() {};
    ChildScope.prototype = this;
    child = new ChildScope();
  }

  // put this child into its parent's children list before
  // giving this child its own list of children
  parent.$$children.push(child);

  // shadow these important attributes
  child.$$watchers = [];
  child.$$children = [];
  child.$$listeners = {};
  child.$parent = parent;

  return child;
};

Scope.prototype.$destroy = function() {
  if (this === this.$root) {
    return;
  }
  var siblings = this.$parent.$$children;
  var indexOfThis = siblings.indexOf(this);
  if (indexOfThis >= 0) {
    this.$broadcast('$destroy');
    siblings.splice(indexOfThis, 1);
  }
};

Scope.prototype.$on = function(eventName, listener) {
  var listeners = this.$$listeners[eventName];
  if (!listeners) {
    this.$$listeners[eventName] = listeners = [];
  }
  listeners.push(listener);
  return function() {
    var index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners[index] = null;
    }
  };
};

Scope.prototype.$$fireEventOnScope = function(eventName, listenerArgs) {
  var listeners = this.$$listeners[eventName] || [];
  // in listener iteration we're checking for fn's that have been nulled out
  // we then remove them from the array as we iterate over it
  // use while loop (because foreach will f-up if indexed items are removed)
  var index = 0;
  while (index < listeners.length) {
    if (listeners[index] === null) {
      listeners.splice(index, 1);
    } else {
      try {
        listeners[index].apply(null, listenerArgs);
      } catch (error) {
        console.error(error);
      }
      index++;
    }
  }
};

// TargetScope = scope on which the event occurred 
// DOM equivalent: target
// ---------
// CurrentScope = scope on which the event listener was attached 
// DOM equivalent: currentTarget
Scope.prototype.$emit = function(eventName) {
  var scope = this;
  // track whether or not to kill propagation to parents
  var propagationStopped = false;
  var event = {
    name: eventName,
    targetScope: this,
    stopPropagation: function() {
      propagationStopped = true;
    },
    preventDefault: function() {
      event.defaultPrevented = true;
    }
  };
  var listenerArgs = [event].concat(_.rest(arguments));

  do {
    // be sure to pass the current scope
    event.currentScope = scope;

    scope.$$fireEventOnScope(eventName, listenerArgs);
    scope = scope.$parent;
  } while (scope && !propagationStopped);

  // clean up the current scope
  event.currentScope = null;

  // always return the event to the caller
  return event;
};

Scope.prototype.$broadcast = function(eventName) {
  var event = {
    name: eventName,
    targetScope: this,
    preventDefault: function() {
      event.defaultPrevented = true;
    }
  };
  var listenerArgs = [event].concat(_.rest(arguments));
  
  // there's no direct path down scope heirarchy, so we use the everyScope helper
  // to walk the chain down
  this.$$everyScope(function(scope) {
    // be sure to pass the current scope
    event.currentScope = scope;

    scope.$$fireEventOnScope(eventName, listenerArgs);
    return true;
  });
  
  // clean up the current scope
  event.currentScope = null;

  // always return the event to the caller
  return event;
};

Scope.prototype.$$beginPhase = function(phase) {
  if (this.$$phase) {
    throw new Error(this.$$phase + ' already in progress');
  }
  this.$$phase = phase;
};

Scope.prototype.$$clearPhase = function() {
  this.$$phase = null;
};

Scope.prototype.$$areEqual = function(newVal, oldVal, valueEq) {
  if (valueEq) {
    return _.isEqual(newVal, oldVal);
  }
  return newVal === oldVal || (
          typeof(newVal) === 'number' && 
          typeof(oldVal) === 'number' &&
          isNaN(newVal) && isNaN(oldVal)
        );
};

Scope.prototype.$eval = function(expr, locals) {
  // return the executed expression, passing the scope in
  // as well as the locals that were passed along in the call
  return expr(this, locals);
};

Scope.prototype.$evalAsync = function(expr) {
  var self = this;
  // if this scope is not digesting and there's nothing
  // currently in the async queue
  if (!self.$$phase && !self.$$asyncQueue.length) {
    // we defer the beginning of the digest slightly, so that
    // callers can be sure the function returns immediately, 
    // instead of evaluating the expression synchronously
    setTimeout(function() {
      // this ensures that we trigger a digest cycle immediately
      // after we've augmented the async queue
      if (self.$$asyncQueue.length) {
        self.$root.$digest();
      }
    }, 0);
  }
  this.$$asyncQueue.push({ scope: this, expression: expr });
};

Scope.prototype.$apply = function(expr) {
  try {
    this.$$beginPhase(PHASES.APPLY);
    return this.$eval(expr);
  } finally {
    // reset the current phase before beginning the digest
    this.$$clearPhase();
    this.$root.$digest();
  }
};

Scope.prototype.$$flushApplyAsync = function() {
  while (this.$$applyAsyncQueue.length) {
    try {
      this.$$applyAsyncQueue.shift()();
    } catch (e) {
      console.error(e);
    }
  }
  this.$root.$$applyAsyncId = null;
};

// Really handy for when you need to apply multiple things within a 
// short time period of one another
Scope.prototype.$applyAsync = function(expr) {
  var self = this;
  // we pass in this function so that when invoked,
  // it will be evaluated in the context of the correct scope
  self.$$applyAsyncQueue.push(function() {
    self.$eval(expr);
  });
  // then schedule something to drain the queue and invoke all
  // the functions awaiting
  if (self.$root.$$applyAsyncId === null) {
    self.$root.$$applyAsyncId = setTimeout(function() {
      // Note: do not $apply each individual item in the queue
      // we only apply outside of the loop because we only want to
      // run one digest loop
      self.$apply(_.bind(self.$$flushApplyAsync, self));
    }, 0);
  }
};

Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
  var self = this;
  var watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || function() { },
    valueEq: !!valueEq,  // coerce to a boolean
    last: initWatchVal
  };
  // Add to the front of the array (later working backward to consume)
  // in the event an existing item is spliced out
  self.$$watchers.unshift(watcher);
  // ensure that if a new watcher was added from another watch's
  // listener, that we run through the listeners once more
  self.$root.$$lastDirtyWatch = null;
  // return a function that removes this watch from the scope
  return function() {
    var index = self.$$watchers.indexOf(watcher);
    if (index >= 0) {
      self.$$watchers.splice(index, 1);
      self.$root.$$lastDirtyWatch = null;
    }
  };
};

Scope.prototype.$watchGroup = function(watchFns, listenerFn) {
  // this will be used for tracking deregistration of listeners
  // in the case of no watch functions being passed
  var shouldCall;

  var self = this;
  var newValues = new Array(watchFns.length);
  var oldValues = new Array(watchFns.length);
  // bool to ensure we schedule a call to the group's listener function
  // during the current digest cycle
  var changeReactionScheduled = false;
  // ensure the first run passes exactly the same object for old and new vals
  var firstRun = true;

  // short circuit the case where there are no watch functions
  if (watchFns.length === 0) {
    shouldCall = true;
    self.$evalAsync(function() {
      if (shouldCall) {
        listenerFn(newValues, oldValues, self);
      }
    });
    // the deregistration function in this case simply flips the 
    // boolean to eliminate any further calls to these listeners
    return function() {
      shouldCall = false;
    };
  }

  function watchGroupListener() {
    if (firstRun) {
      firstRun = false;
      listenerFn(newValues, newValues, self);
    } else {
      listenerFn(newValues, oldValues, self);
    }
    changeReactionScheduled = false;
  }

  // since the individual watch functions already return removal functions, all
  // we need to do is collect them then pass them to a de-registration function
  // that invokes all of them
  var destroyFunctions = _.map(watchFns, function(watchFn, idx) {
    // define a separate, internal listener function for the watchGroup
    // that defers being run until all watches have been checked
    return self.$watch(watchFn, function(newVal, oldVal) {
      newValues[idx] = newVal;
      oldValues[idx] = oldVal;
      if (!changeReactionScheduled) {
        changeReactionScheduled = true;
        self.$evalAsync(watchGroupListener);
      }
    });
  });

  return function() {
    _.forEach(destroyFunctions, function(destroyFunction) {
      destroyFunction();
    });
  };
};

Scope.prototype.$watchCollection = function(watchFn, listenerFn) {
  // we want these declarations to persist between digest cycles in the closure
  // because we want to share them between the internal watch and listener functions
  var newVal;
  var oldVal;
  // we track the size of objects (based on key counts) to avoid unnecessary iteration
  var oldObjLength;
  // we want to know if we explicitly need to pass the old value
  // so we check if it is actually being used based on the args
  var veryOldValue;
  var trackVeryOldValue = (listenerFn.length > 1); // track the number of args passed to listener
  // we also track the first run to pass the same obj for old and new in the listener
  var firstRun = true;
  var self = this;
  // we care if there is a difference in the object between successive invocations
  // so we simply use this counter for the life of this watch
  var changeCount = 0;

  var internalWatchFn = function(scope) {
    var newObjLength;

    newVal = watchFn(scope);

    // handle arrays and objects in the first branch
    // and although strings have a length, they will not pass this guard - 
    // b/c strings are immutable in JS
    if (_.isObject(newVal)) {
      if (isArrayLike(newVal)) {
        // if the old value wasn't even an array, handle the change
        if (!_.isArray(oldVal)) {
          changeCount++;
          oldVal = [];
        }
        // if the lengths are different
        if (oldVal.length !== newVal.length) {
          changeCount++;
          oldVal.length = newVal.length;
        }
        // iterate and check values here
        _.forEach(newVal, function(newItem, idx) {
          var bothNaN = _.isNaN(newItem) && _.isNaN(oldVal[idx]);
          if (!bothNaN && newItem !== oldVal[idx]) {
            changeCount++;
            oldVal[idx] = newItem;
          }
        });
      } else {
        // if the old value wasn't an 'object', handle that first
        if (!_.isObject(oldVal) || isArrayLike(oldVal)) {
          changeCount++;
          oldVal = {};
          oldObjLength = 0;
        }
        // set up the new object's length to check against
        newObjLength = 0;

        // iterate keys and check values here
        _.forOwn(newVal, function(newItem, key) {
          // build up the number of keys in the new object
          // then be sure to number of keys in the old object up to date
          newObjLength++;

          if (oldVal.hasOwnProperty(key)) {
            var bothNaN = _.isNaN(newItem) && _.isNaN(oldVal[key]);
            if (!bothNaN && oldVal[key] !== newItem) {
              changeCount++;
              oldVal[key] = newItem;
            }
          } else {
            changeCount++;
            oldObjLength++;
            oldVal[key] = newItem;
          }
        });

        if (oldObjLength > newObjLength) {
          changeCount++;

          // now match up the values of the old object with the new one
          _.forOwn(oldVal, function(oldItem, key) {
            if (!newVal.hasOwnProperty(key)) {
              oldObjLength--;
              delete oldVal[key];
            }
          });
        }
      }
    } else {
      // we handle NaNs with the $$areEqual
      if (!self.$$areEqual(newVal, oldVal, false)) {
        changeCount++;
      }
      oldVal = newVal;
    }


    return changeCount;
  };

  var internalListenerFn = function() {
    if (firstRun) {
      listenerFn(newVal, newVal, self);
      firstRun = false;
    } else {
      listenerFn(newVal, veryOldValue, self);
    }    

    if (trackVeryOldValue) {
      veryOldValue = _.clone(newVal);
    }
  };

  return this.$watch(internalWatchFn, internalListenerFn);
};

Scope.prototype.$$everyScope = function(fn) {
  // executes an arbitrary function once for each scope
  // in the heirarchy until the fn returns a falsy value
  if (fn(this)) {
    return this.$$children.every(function(child) {
      return child.$$everyScope(fn);
    });
  } else {
    return false;
  }
};

Scope.prototype.$$digestOnce = function() {
  var dirty;
  var self = this;
  var continueLoop = true;

  // with this call to every scope, digestOnce now runs through the entire scope
  // heirarchy and returns a bool indicating whether any watch anywhere in the
  // entire chain was dirty
  this.$$everyScope(function(scope) {
    var newVal, oldVal;
    
    // Consume from the right
    _.forEachRight(scope.$$watchers, function(watcher) {
      try {
        // make sure there is still a watch statement (it might have
        // been pulled in a previous watch or listener function
        if (watcher) {
          // run the watch function to compare the values
          newVal = watcher.watchFn(scope);
          oldVal = watcher.last;
          // if the old hasn't been set or differs,
          // run the listener
          if (!scope.$$areEqual(newVal, oldVal, watcher.valueEq)) {
            // set the lastDirtyWatch
            scope.$root.$$lastDirtyWatch = watcher;
            // update the last value with the most recent one
            watcher.last = (watcher.valueEq ? _.cloneDeep(newVal) : newVal);
            // on the first digest pass, when there is no oldVal, return
            // the newVal too 
            watcher.listenerFn(
              newVal,
              oldVal === initWatchVal ? newVal : oldVal,
              scope
            );
            // set the dirty flag
            dirty = true;
          } else if (scope.$root.$$lastDirtyWatch === watcher) {
            continueLoop = false;
            return false;
          }
        }
      } catch(e) {
        console.error(e);
      }
    });

    return continueLoop;
  });
  return dirty;
};

Scope.prototype.$$postDigest = function(fn) {
  this.$$postDigestQueue.push(fn);
};

Scope.prototype.$digest = function() {
  var dirty;
  var ttl = 10;

  this.$root.$$lastDirtyWatch = null;
  this.$$beginPhase(PHASES.DIGEST);

  // If there's an apply async flush timeout already scheduled to be run
  // in the near future, cancel it and flush the work immediately
  if (this.$root.$$applyAsyncId) {
    clearTimeout(this.$root.$$applyAsyncId);
    this.$$flushApplyAsync();
  }

  do {
    while (this.$$asyncQueue.length) {
      try {
        var asyncTask = this.$$asyncQueue.shift();
        asyncTask.scope.$eval(asyncTask.expression);
      } catch (e) {
        console.error(e);
      }
    }
    dirty = this.$$digestOnce();
    // do not allow infinite loop from functions added to the 
    // async queue in a watch
    if ( (dirty || this.$$asyncQueue.length) && !(ttl--) ) {
      this.$$clearPhase();
      throw new Error('10 digest iterations reached');
    }
  } while (dirty || this.$$asyncQueue.length);
  this.$$clearPhase();

  // consume the array from the front and empty it out
  while (this.$$postDigestQueue.length) {
    try {
      this.$$postDigestQueue.shift()();
    } catch (e) {
      console.error(e);
    }
  }
};


module.exports = Scope;
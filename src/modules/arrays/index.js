/*globals window Uint8Array Uint8ClampedArray Int8Array Uint16Array Int16Array Uint32Array Int32Array Float32Array Float64Array */
/*jshint newcap: false */

// Module can be used both in Node.js environment and in Web browser
// using RequireJS. R.JS Optimizer will strip out this if statement.
if (typeof define !== 'function') {
  var define = require('amdefine')(module);
}

define(function (require, exports, module) {
  var arrays = {},

      // Check for Safari. Typed arrays are faster almost everywhere
      // ... except Safari.
      notSafari = (function() {
        var safarimatch  = / AppleWebKit\/([0123456789.+]+) \(KHTML, like Gecko\) Version\/([0123456789.]+) (Safari)\/([0123456789.]+)/,
            match = navigator.userAgent.match(safarimatch);
        return (match && match[3]) ? false: true;
      }());

  arrays.version = '0.0.1';

  arrays.webgl = (typeof window !== 'undefined') && !!window.WebGLRenderingContext;

  arrays.typed = (function() {
    try {
      new Float64Array(0);
      return true;
    } catch(e) {
      return false;
    }
  }());

  // http://www.khronos.org/registry/typedarray/specs/latest/#TYPEDARRAYS
  // regular
  // Uint8Array
  // Uint8ClampedArray
  // Uint16Array
  // Uint32Array
  // Int8Array
  // Int16Array
  // Int32Array
  // Float32Array
  // Float64Array

  arrays.create = function(size, fill, array_type) {
    if (!array_type) {
      if (arrays.webgl || arrays.typed) {
        array_type = "Float32Array";
      } else {
        array_type = "regular";
      }
    }
    if (fill === undefined) {
      fill = 0;
    }
    var a, i;
    if (array_type === "regular") {
      a = new Array(size);
    } else {
      switch(array_type) {
        case "Float64Array":
          a = new Float64Array(size);
          break;
        case "Float32Array":
          a = new Float32Array(size);
          break;
        case "Int32Array":
          a = new Int32Array(size);
          break;
        case "Int16Array":
          a = new Int16Array(size);
          break;
        case "Int8Array":
          a = new Int8Array(size);
          break;
        case "Uint32Array":
          a = new Uint32Array(size);
          break;
        case "Uint16Array":
          a = new Uint16Array(size);
          break;
        case "Uint8Array":
          a = new Uint8Array(size);
          break;
        case "Uint8ClampedArray":
          a = new Uint8ClampedArray(size);
          break;
        default:
          throw new Error("arrays: couldn't understand array type \"" + array_type + "\".");
      }
    }
    i=-1; while(++i < size) { a[i] = fill; }
    return a;
  };

  arrays.constructor_function = function(source) {
    if (source.buffer && source.buffer.__proto__ && source.buffer.__proto__.constructor) {
      return source.__proto__.constructor;
    }
    switch(source.constructor) {
      case Array: return Array;
      case Float32Array: return Float32Array;
      case Uint8Array: return Uint8Array;
      case Float64Array: return Float64Array;
      case Int32Array: return Int32Array;
      case Int16Array: return Int16Array;
      case Int8Array: return Int8Array;
      case Uint32Array: return Uint32Array;
      case Uint16Array: return Uint16Array;
      case Uint8ClampedArray: return Uint8ClampedArray;
      default:
        throw new Error(
            "arrays.constructor_function: must be an Array or Typed Array: " + "  source: " + source);
            // ", source.constructor: " + source.constructor +
            // ", source.buffer: " + source.buffer +
            // ", source.buffer.slice: " + source.buffer.slice +
            // ", source.buffer.__proto__: " + source.buffer.__proto__ +
            // ", source.buffer.__proto__.constructor: " + source.buffer.__proto__.constructor
      }
  };

  arrays.copy = function(source, dest) {
    var len = source.length,
        i = -1;
    while(++i < len) { dest[i] = source[i]; }
    if (arrays.constructor_function(dest) === Array) dest.length = len;
    return dest;
  };

  arrays.clone = function(source) {
    var i, len = source.length, clone, constructor;
    constructor = arrays.constructor_function(source);
    if (constructor === Array) {
      clone = new constructor(len);
      for (i = 0; i < len; i++) { clone[i] = source[i]; }
      return clone;
    }
    if (source.buffer.slice) {
      clone = new constructor(source.buffer.slice(0));
      return clone;
    }
    clone = new constructor(len);
    for (i = 0; i < len; i++) { clone[i] = source[i]; }
    return clone;
  };

  /** @return true if x is between a and b. */
  // float a, float b, float x
  arrays.between = function(a, b, x) {
    return x < Math.max(a, b) && x > Math.min(a, b);
  };

  // float[] array
  arrays.max = function(array) {
    return Math.max.apply( Math, array );
  };

  // float[] array
  arrays.min = function(array) {
    return Math.min.apply( Math, array );
  };

  // FloatxxArray[] array
  arrays.maxTypedArray = function(array) {
    var test, i,
    max = Number.MIN_VALUE,
    length = array.length;
    for(i = 0; i < length; i++) {
      test = array[i];
      max = test > max ? test : max;
    }
    return max;
  };

  // FloatxxArray[] array
  arrays.minTypedArray = function(array) {
    var test, i,
    min = Number.MAX_VALUE,
    length = array.length;
    for(i = 0; i < length; i++) {
      test = array[i];
      min = test < min ? test : min;
    }
    return min;
  };

  // float[] array
  arrays.maxAnyArray = function(array) {
    try {
      return Math.max.apply( Math, array );
    }
    catch (e) {
      if (e instanceof TypeError) {
        var test, i,
        max = Number.MIN_VALUE,
        length = array.length;
        for(i = 0; i < length; i++) {
          test = array[i];
          max = test > max ? test : max;
        }
        return max;
      }
    }
  };

  // float[] array
  arrays.minAnyArray = function(array) {
    try {
      return Math.min.apply( Math, array );
    }
    catch (e) {
      if (e instanceof TypeError) {
        var test, i,
        min = Number.MAX_VALUE,
        length = array.length;
        for(i = 0; i < length; i++) {
          test = array[i];
          min = test < min ? test : min;
        }
        return min;
      }
    }
  };

  arrays.average = function(array) {
    var i, acc = 0,
    length = array.length;
    for (i = 0; i < length; i++) {
      acc += array[i];
    }
    return acc / length;
  };

  /**
    Create a new array of the same type as 'array' and of length 'newLength', and copies as many
    elements from 'array' to the new array as is possible.

    If 'newLength' is less than 'array.length', and 'array' is  a typed array, we still allocate a
    new, shorter array in order to allow GC to work.

    The returned array should always take the place of the passed-in 'array' in client code, and this
    method should not be counted on to always return a copy. If 'array' is non-typed, we manipulate
    its length instead of copying it. But if 'array' is typed, we cannot increase its size in-place,
    therefore must pas a *new* object reference back to client code.
  */
  arrays.extend = function(array, newLength) {
    var i,
        len,
        extendedArray,
        Constructor;

    Constructor = arrays.constructor_function(array);

    if (Constructor === Array) {
      array.length = newLength;
      return array;
    }

    extendedArray = new Constructor(newLength);

    // prevent 'set' method from erroring when array.length > newLength, by using the (no-copy) method
    // 'subarray' to get an array view that is clamped to length = min(array.length, newLength)
    extendedArray.set(array.subarray(0, newLength));

    return extendedArray;
  };


  // publish everything to exports
  for (var key in arrays) {
    if (arrays.hasOwnProperty(key)) exports[key] = arrays[key];
  }
});

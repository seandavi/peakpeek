// A tiny test harness for test.html (SPEC.md §4, the assert.js contract).
//
//   PeakPeek.test(name, fn)        registers a test; fn may be async
//   PeakPeek.assert.*              throws an AssertionError when a check fails
//   PeakPeek.runTests()            runs every registered test, one at a time, and resolves to
//                                  {passed, failed, results}, where each result is
//                                  {name, file, ok, message, ms}
//
// `file` is the test file that registered the test, so test.html can group results. A test
// that takes longer than TEST_TIMEOUT_MS fails, so one hung promise can't stall the page.
window.PeakPeek = window.PeakPeek || {};

(function (PeakPeek) {
  "use strict";

  const TEST_TIMEOUT_MS = 10000;
  const MAX_SHOWN_CHARS = 1000;
  const MISSING = { toString: () => "(missing)" };

  const registered = [];
  let pendingRejects = null; // assert.rejects promises of the running test

  class AssertionError extends Error {}
  AssertionError.prototype.name = "AssertionError";

  PeakPeek.test = function (name, fn) {
    const script = document.currentScript;
    const file = script && script.src ? relativeToPage(script.src) : null;
    registered.push({ name: String(name), fn, file });
  };

  PeakPeek.runTests = async function () {
    const results = [];
    for (const { name, fn, file } of registered) {
      const started = performance.now();
      let message = null;
      pendingRejects = [];
      try {
        await withTimeout(Promise.resolve().then(fn), TEST_TIMEOUT_MS);
        // A forgotten `await` on assert.rejects must still fail the test.
        await Promise.all(pendingRejects);
      } catch (error) {
        message = describeError(error);
      }
      pendingRejects = null;
      const ms = Math.round(performance.now() - started);
      results.push({ name, file, ok: message === null, message, ms });
    }
    const passed = results.filter((r) => r.ok).length;
    return { passed, failed: results.length - passed, results };
  };

  PeakPeek.assert = {
    equal(actual, expected, message) {
      if (!sameValue(actual, expected)) {
        fail(message, ["expected: " + show(expected), "actual:   " + show(actual)]);
      }
    },

    deepEqual(actual, expected, message) {
      const diff = firstDifference(actual, expected, "");
      if (diff === null) return;
      const lines = [];
      if (diff.path) {
        lines.push("differs at " + diff.path);
        lines.push("  expected: " + show(diff.expected));
        lines.push("  actual:   " + show(diff.actual));
      }
      lines.push("expected: " + show(expected));
      lines.push("actual:   " + show(actual));
      fail(message, lines);
    },

    near(actual, expected, tolerance, message) {
      if (typeof tolerance !== "number" || !(tolerance >= 0)) {
        throw new TypeError("assert.near needs a tolerance ≥ 0, got " + show(tolerance));
      }
      const close = typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
      if (!close) {
        fail(message, [
          "expected: " + show(expected) + " ± " + show(tolerance),
          "actual:   " + show(actual),
        ]);
      }
    },

    throws(fn, pattern) {
      let caught;
      try {
        fn();
      } catch (error) {
        caught = { error };
      }
      if (!caught) fail(null, ["expected the function to throw, but it returned normally"]);
      checkPattern(caught.error, pattern, "thrown");
      return caught.error;
    },

    rejects(promise, pattern) {
      const check = Promise.resolve()
        .then(() => (typeof promise === "function" ? promise() : promise))
        .then(
          (value) => fail(null, ["expected the promise to reject, but it resolved to " + show(value)]),
          (error) => {
            checkPattern(error, pattern, "rejection");
            return error;
          }
        );
      if (pendingRejects) pendingRejects.push(check);
      return check;
    },
  };

  function fail(message, lines) {
    throw new AssertionError((message ? [message, ...lines] : lines).join("\n"));
  }

  function checkPattern(error, pattern, what) {
    if (pattern === undefined) return;
    const text = error instanceof Error ? error.message : String(error);
    if (!pattern.test(text)) {
      fail(null, [
        "the " + what + " message doesn't match",
        "expected: " + String(pattern),
        "actual:   " + show(text),
      ]);
    }
  }

  // Strict equality, except that NaN equals NaN.
  function sameValue(a, b) {
    return a === b || (a !== a && b !== b);
  }

  // The first place two values differ, as {path, actual, expected}, or null if they don't.
  function firstDifference(actual, expected, path) {
    if (sameValue(actual, expected)) return null;
    const here = { path, actual, expected };
    if (!isObject(actual) || !isObject(expected)) return here;
    if (Array.isArray(actual) !== Array.isArray(expected)) return here;
    if (actual instanceof Date || expected instanceof Date) {
      return actual instanceof Date && expected instanceof Date &&
        sameValue(actual.getTime(), expected.getTime()) ? null : here;
    }
    if (actual instanceof RegExp || expected instanceof RegExp) {
      return String(actual) === String(expected) ? null : here;
    }
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of keys) {
      const has = (o) => Object.prototype.hasOwnProperty.call(o, key);
      const diff = firstDifference(
        has(actual) ? actual[key] : MISSING,
        has(expected) ? expected[key] : MISSING,
        path + pathPart(actual, key)
      );
      if (diff) return diff;
    }
    return null;
  }

  function isObject(v) {
    return typeof v === "object" && v !== null && v !== MISSING;
  }

  function pathPart(container, key) {
    if (Array.isArray(container)) return "[" + key + "]";
    return /^[A-Za-z_$][\w$]*$/.test(key) ? "." + key : "[" + JSON.stringify(key) + "]";
  }

  // A value as one line of text, so failures show exactly what was compared.
  function show(value) {
    const text = format(value, new Set());
    if (text.length <= MAX_SHOWN_CHARS) return text;
    return text.slice(0, MAX_SHOWN_CHARS) + "… (" + (text.length - MAX_SHOWN_CHARS) + " more characters)";
  }

  function format(value, seen) {
    if (value === MISSING) return "(missing)";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") return Object.is(value, -0) ? "-0" : String(value);
    if (typeof value === "bigint") return value + "n";
    if (typeof value === "function") return "[function " + (value.name || "anonymous") + "]";
    if (typeof value !== "object" || value === null) return String(value);
    if (value instanceof RegExp) return String(value);
    if (value instanceof Date) return "Date(" + value.toISOString() + ")";
    if (value instanceof Error) return value.name + ": " + value.message;
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const text = Array.isArray(value)
      ? "[" + value.map((v) => format(v, seen)).join(", ") + "]"
      : "{" + Object.keys(value)
          .map((k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)) + ": " + format(value[k], seen))
          .join(", ") + "}";
    seen.delete(value);
    return text;
  }

  function describeError(error) {
    if (error instanceof AssertionError) return error.message;
    if (error instanceof Error) return error.stack || error.name + ": " + error.message;
    return "threw a non-Error: " + show(error);
  }

  function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new AssertionError("timed out after " + ms + " ms")), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function relativeToPage(url) {
    const base = location.href.replace(/[^/]*([?#].*)?$/, "");
    return url.startsWith(base) ? url.slice(base.length) : url;
  }
})(window.PeakPeek);

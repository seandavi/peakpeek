// Tests for src/read.js (issue 2). Every input is built from bytes here: no network.
// readURL is tested against a stand-in fetch, put back when each test ends.

(function () {
  var test = PeakPeek.test;
  var assert = PeakPeek.assert;

  var BED = "chr1\t100\t200\ta\nchr2\t0\t1\tc\nchr10\t5000\t6000\td\n";

  async function gzipBytes(text) {
    var stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // bgzip's layout: two gzip members end to end.
  async function bgzipBytes(first, second) {
    var a = await gzipBytes(first);
    var b = await gzipBytes(second);
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  // Runs fn with window.fetch replaced by fakeFetch, then puts the real one back.
  async function withFetch(fakeFetch, fn) {
    var realFetch = window.fetch;
    window.fetch = fakeFetch;
    try {
      await fn();
    } finally {
      window.fetch = realFetch;
    }
  }

  function respondWith(body, init) {
    return function () {
      return Promise.resolve(new Response(body, init));
    };
  }

  test("read: isGzip looks at the bytes 1f 8b", async function () {
    assert.equal(PeakPeek.isGzip(await gzipBytes(BED)), true);
    assert.equal(PeakPeek.isGzip(new TextEncoder().encode(BED)), false);
    assert.equal(PeakPeek.isGzip(new Uint8Array([0x1f])), false);
    assert.equal(PeakPeek.isGzip(new Uint8Array([])), false);
  });

  test("read: readFile returns plain text as it is", async function () {
    assert.equal(await PeakPeek.readFile(new File([BED], "peaks.bed")), BED);
  });

  test("read: readFile gunzips by the bytes, not the name", async function () {
    var gz = await gzipBytes(BED);
    assert.equal(await PeakPeek.readFile(new File([gz], "peaks.bed")), BED, "gzip named .bed");
    assert.equal(await PeakPeek.readFile(new File([gz], "peaks.bed.gz")), BED, "gzip named .gz");
    assert.equal(await PeakPeek.readFile(new File([BED], "peaks.bed.gz")), BED, "plain named .gz");
  });

  test("read: readFile reads a Blob too, and drops a UTF-8 byte-order mark", async function () {
    assert.equal(await PeakPeek.readFile(new Blob(["\uFEFF" + BED])), BED);
  });

  test("read: bgzip (two gzip members) is an error saying so, never a partial file", async function () {
    var bytes = await bgzipBytes(BED, "chr3\t1\t2\tz\n");
    await assert.rejects(PeakPeek.readFile(new File([bytes], "peaks.bed.gz")), /bgzip/);
    await assert.rejects(PeakPeek.bytesToText(bytes), /decompress it first/i);
  });

  test("read: a damaged gzip file is an error, and not called bgzip", async function () {
    var gz = await gzipBytes(BED);
    var cut = gz.slice(0, gz.length - 10);
    var message = "";
    try {
      await PeakPeek.readFile(new File([cut], "peaks.bed.gz"));
    } catch (err) {
      message = err.message;
    }
    assert.equal(/damaged or cut short/.test(message), true, "got: " + message);
    assert.equal(/bgzip/.test(message), false, "got: " + message);
  });

  test("read: an HTML page is 'a web page, not a peak file', gzipped or not", async function () {
    var html = "\n  <!DOCTYPE html><html><body>Dropbox</body></html>";
    await assert.rejects(PeakPeek.readFile(new File([html], "peaks.bed")), /web page, not a peak file/);
    var gz = await gzipBytes(html);
    await assert.rejects(PeakPeek.readFile(new File([gz], "peaks.bed.gz")), /web page, not a peak file/);
  });

  test("read: readURL refuses addresses that aren't http(s)", async function () {
    await assert.rejects(PeakPeek.readURL("file:///Users/me/peaks.bed"), /Only http:\/\/ and https:\/\//);
    await assert.rejects(PeakPeek.readURL("ftp://example.org/peaks.bed"), /Only http:\/\/ and https:\/\//);
    await assert.rejects(PeakPeek.readURL("peaks.bed"), /isn't a web address/);
  });

  test("read: readURL returns plain and gzipped text", async function () {
    await withFetch(respondWith(BED), async function () {
      assert.equal(await PeakPeek.readURL("  https://example.org/peaks.bed\n"), BED);
    });
    var gz = await gzipBytes(BED);
    await withFetch(respondWith(gz), async function () {
      assert.equal(await PeakPeek.readURL("https://example.org/peaks.bed.gz"), BED);
    });
  });

  test("read: readURL's CORS-or-offline failure says both, and what to do", async function () {
    var refuse = function () {
      return Promise.reject(new TypeError("Failed to fetch"));
    };
    await withFetch(refuse, async function () {
      var p = PeakPeek.readURL("https://zenodo.org/records/1/files/peaks.bed");
      await assert.rejects(p, /zenodo\.org: the server may not allow web pages to read it, or you're offline\. Download it and drop it here instead/);
    });
  });

  test("read: readURL reports the HTTP status", async function () {
    await withFetch(respondWith("Not here", { status: 404, statusText: "Not Found" }), async function () {
      await assert.rejects(PeakPeek.readURL("https://example.org/missing.bed"), /404 Not Found.*no file at that address/);
    });
    await withFetch(respondWith("No", { status: 403 }), async function () {
      await assert.rejects(PeakPeek.readURL("https://example.org/secret.bed"), /403.*may need a login/);
    });
    await withFetch(respondWith("Oops", { status: 500 }), async function () {
      await assert.rejects(PeakPeek.readURL("https://example.org/peaks.bed"), /answered 500 for/);
    });
  });

  test("read: readURL rejects an HTML page and bgzip", async function () {
    await withFetch(respondWith("<html><body>Sign in to Google Drive</body></html>"), async function () {
      await assert.rejects(PeakPeek.readURL("https://drive.google.com/file/d/x/view"), /web page, not a peak file/);
    });
    var bytes = await bgzipBytes(BED, BED);
    await withFetch(respondWith(bytes), async function () {
      await assert.rejects(PeakPeek.readURL("https://example.org/peaks.bed.gz"), /bgzip/);
    });
  });
})();

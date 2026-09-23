// read.js: a File or a URL → its text (SPEC.md §4, §5). Owned by issue 2.
//
// Every failure is an Error whose message says, in plain English, which of §5's traps
// happened and what to do about it. The page shows the message on the file's card.
window.PeakPeek = window.PeakPeek || {};

(function (PeakPeek) {
  "use strict";

  var BGZIP_MESSAGE =
    "This looks like bgzip (several gzip blocks joined end to end), which the browser " +
    "can't fully decompress. Decompress it first (for example `gunzip -c file.bed.gz > " +
    "file.bed`) and drop the result here.";

  var WEB_PAGE_MESSAGE =
    "This is a web page, not a peak file. A share link (Dropbox, Google Drive) usually " +
    "returns a page about the file: use its direct download link instead, or download " +
    "the file and drop it here.";

  /** True if the bytes start with gzip's magic number, 1f 8b. The file name isn't used. */
  function isGzip(bytes) {
    return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  }

  // bgzip writes a "BC" subfield in the first member's extra field (the BGZF spec).
  // Files joined with plain `cat` don't have it; for those, the browser's error says so.
  function hasBgzfHeader(bytes) {
    return bytes.length >= 14 && (bytes[3] & 0x04) !== 0 && bytes[12] === 0x42 && bytes[13] === 0x43;
  }

  /**
   * Decompresses gzip bytes, reading the whole stream so any error surfaces: never
   * returns part of a file. Read through a reader, not Response, because Response turns
   * the real error into a misleading "TypeError: Failed to fetch" (§5).
   */
  async function gunzip(bytes) {
    var reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
    var chunks = [];
    var total = 0;
    try {
      for (;;) {
        var step = await reader.read();
        if (step.done) break;
        chunks.push(step.value);
        total += step.value.length;
      }
    } catch (err) {
      // Chrome 152 delivers the first member, then fails with "Junk found after end of
      // compressed data".
      if (/junk|trailing|after (the )?end/i.test(err.message) || hasBgzfHeader(bytes)) {
        throw new Error(BGZIP_MESSAGE);
      }
      throw new Error(
        "This gzip file is damaged or cut short, so it couldn't be decompressed (" +
          err.message + "). Download it again."
      );
    }
    var out = new Uint8Array(total);
    var offset = 0;
    chunks.forEach(function (chunk) {
      out.set(chunk, offset);
      offset += chunk.length;
    });
    return out;
  }

  /**
   * Bytes → text: gunzips if they start with 1f 8b, decodes UTF-8 (dropping a byte-order
   * mark), and rejects an HTML page (first non-whitespace character "<").
   */
  async function bytesToText(bytes) {
    if (isGzip(bytes)) bytes = await gunzip(bytes);
    var text = new TextDecoder("utf-8").decode(bytes);
    if (/^\s*</.test(text)) throw new Error(WEB_PAGE_MESSAGE);
    return text;
  }

  /** PeakPeek.readFile(file: File) → Promise<string> */
  async function readFile(file) {
    return bytesToText(new Uint8Array(await file.arrayBuffer()));
  }

  /** PeakPeek.readURL(url: string) → Promise<string> */
  async function readURL(url) {
    var address = String(url).trim();
    var parsed;
    try {
      parsed = new URL(address);
    } catch (err) {
      throw new Error("\"" + address + "\" isn't a web address. It should start with https://.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(
        "Only http:// and https:// addresses can be read, not " + parsed.protocol +
          "//. For a file on your computer, drop it here instead."
      );
    }

    var response;
    try {
      response = await fetch(parsed.href);
    } catch (err) {
      // A CORS refusal and being offline both reject with a bare TypeError, and
      // JavaScript can't tell them apart (§5), so the message names both.
      throw new Error(
        "Couldn't read the file from " + parsed.host + ": the server may not allow web " +
          "pages to read it, or you're offline. Download it and drop it here instead."
      );
    }
    if (!response.ok) {
      var status = response.status + (response.statusText ? " " + response.statusText : "");
      var hint = response.status === 404 ? " There's no file at that address: check it."
        : response.status === 401 || response.status === 403
          ? " The server won't give it out; it may need a login. Download it and drop it here instead."
          : "";
      throw new Error("The server answered " + status + " for " + parsed.href + "." + hint);
    }

    var bytes;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (err) {
      throw new Error(
        "The download from " + parsed.host + " stopped partway (" + err.message + "). " +
          "Try again, or download it and drop it here."
      );
    }
    return bytesToText(bytes);
  }

  PeakPeek.readFile = readFile;
  PeakPeek.readURL = readURL;
  PeakPeek.isGzip = isGzip;
  PeakPeek.gunzip = gunzip;
  PeakPeek.bytesToText = bytesToText;
})(window.PeakPeek);

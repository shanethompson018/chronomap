"""Test server for this PC: serves the project folder at http://127.0.0.1:8765 and tells the browser to keep
nothing, so the file on screen is always the file on disk. Used by the "chronomap" entry in .claude/launch.json:
    py -3 tools/dev_server.py
The live app (GitHub Pages) is not affected by this file.
"""
import functools, http.server, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        # never answer "not changed, use your copy": always send the file
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        return super().send_head()


if __name__ == "__main__":
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Handler, directory=ROOT))
    print("Chrono Map test copy at http://127.0.0.1:%d (no caching)" % PORT, flush=True)
    srv.serve_forever()

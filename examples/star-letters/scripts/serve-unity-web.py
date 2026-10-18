#!/usr/bin/env python3
"""Serve the local Unity Web build without exposing it to the LAN."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class WebHandler(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{
        ".wasm": "application/wasm",
        ".data": "application/octet-stream",
        ".js": "application/javascript",
    })

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5176)
    parser.add_argument("--directory", type=Path, default=(
        Path(__file__).resolve().parents[1] / "unity/LittleOrbit/Builds/Web"
    ))
    args = parser.parse_args()
    directory = args.directory.resolve()
    if not (directory / "index.html").is_file():
        parser.error("No Web build found at {}. Build or copy it here first.".format(directory))
    with ThreadingHTTPServer(("127.0.0.1", args.port), partial(WebHandler, directory=str(directory))) as server:
        print("Unity Web preview: http://127.0.0.1:{}/".format(args.port), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass

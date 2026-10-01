#!/usr/bin/env python3
"""Serveur de developpement local : identique a http.server mais desactive
le cache navigateur (Python http.server n'envoie pas de Cache-Control, ce qui
laisse Chrome mettre les modules JS en cache heuristique et servir une
version perimee sans le savoir). Multi-thread : un navigateur ouvre plusieurs
connexions en parallele, un serveur mono-thread se bloque des la deuxieme.
Usage : python devserver.py [port]"""
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()

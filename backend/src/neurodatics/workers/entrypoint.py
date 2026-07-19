"""RQ worker entrypoint with health check server."""

import logging
import signal
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

from rq import Worker

from ..infra.queue.redis_connection import get_redis_client, get_redis_worker_client

logger = logging.getLogger(__name__)

HEALTH_CHECK_PORT = 8001


class _HealthCheckHandler(BaseHTTPRequestHandler):
    """Minimal health check handler for container orchestration."""

    def do_GET(self):
        if self.path == "/health/worker":
            try:
                redis_ready = bool(get_redis_client().ping())
            except Exception:
                redis_ready = False

            self.send_response(200 if redis_ready else 503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            status = b'{"status":"ok"}' if redis_ready else b'{"status":"not_ready"}'
            self.wfile.write(status)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress request logging


def _start_health_check_server() -> HTTPServer:
    """Start the health check HTTP server in a daemon thread."""
    server = HTTPServer(("0.0.0.0", HEALTH_CHECK_PORT), _HealthCheckHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    logger.info("Worker health check listening on port %d", HEALTH_CHECK_PORT)
    return server


class WorkerManager:
    """Manages the RQ worker lifecycle with graceful shutdown."""

    def start(self) -> None:
        redis_conn = get_redis_worker_client()
        worker = Worker(queues=["default"], connection=redis_conn)

        def handle_sigterm(signum, frame):
            logger.info("SIGTERM received — requesting graceful stop")
            worker.request_stop = True

        signal.signal(signal.SIGTERM, handle_sigterm)

        logger.info("Starting RQ worker on 'default' queue")
        worker.work(with_scheduler=False)


def start_worker_with_health_check() -> None:
    """Launch the RQ worker with a health check server on port 8001."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    _start_health_check_server()
    manager = WorkerManager()
    manager.start()

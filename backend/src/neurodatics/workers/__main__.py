"""Allow running the worker package directly: python -m neurodatics.workers"""

from .entrypoint import start_worker_with_health_check

if __name__ == "__main__":
    start_worker_with_health_check()

import threading


class SingletonMixin:
    """Thread-safe singleton via double-checked locking."""

    _instance: "SingletonMixin | None" = None
    _singleton_lock: threading.Lock = threading.Lock()

    @classmethod
    def get_instance(cls):
        """Return the process-wide instance, creating it on first call."""
        if cls._instance is None:
            with cls._singleton_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

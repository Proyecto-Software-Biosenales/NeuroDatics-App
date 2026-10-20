"""Static-analysis references for required callback/protocol parameters.

Consumed by Vulture, never imported by the application. These are the
``exc_type`` and ``traceback`` parameters of the ``__aexit__`` doubles in the
tests, which the async-context-manager protocol requires and the bodies ignore.
"""

exc_type  # test_network_preflight and test_readiness __aexit__ protocol
traceback  # test_network_preflight and test_readiness __aexit__ protocol

"""Static-analysis references for required callback/protocol parameters.

Consumed by Vulture, never imported by the application. These parameters must
remain in positional signal-handler and async-context-manager signatures.
"""

exc_type  # test_network_preflight and test_readiness __aexit__ protocol
traceback  # test_network_preflight and test_readiness __aexit__ protocol

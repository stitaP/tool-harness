"""stitaP agent runtime for Python.

- ``python -m stitap``            starts the agent (full engine if a bundled binary or Node is
                                  available, otherwise the pure-Python lite core)
- ``from stitap import Harness``  talk to a running agent daemon from Python
- ``from stitap.lite import Agent`` embed the zero-dependency lite agent loop
"""
__version__ = "0.1.0"

from .client import Harness  # noqa: F401

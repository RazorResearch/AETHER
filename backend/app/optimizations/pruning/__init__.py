"""Structured pruning — not implemented.

Reserved for future research (layer dropping, width pruning). Any call raises
``FeatureNotImplemented`` so the API never reports a pruning result that was
not produced.
"""

from app.core.errors import FeatureNotImplemented


def prune(*_, **__):
    raise FeatureNotImplemented("Structured pruning is not implemented in this version.")

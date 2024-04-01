# Usage: TORCH_TRACE=/tmp/test python torchdbg.py  && cat /tmp/test/*

import torch
from torch.utils._python_dispatch import TorchDispatchMode
from torch.utils._pytree import tree_map
import torch.overrides
from torch.utils.weak import WeakTensorKeyDictionary
from torch._logging._internal import trace_structured
from torch._logging.structured import from_traceback

import json
import logging
import weakref
from functools import partial
import itertools


class LoggingMode(TorchDispatchMode):
    next_id: int

    def __init__(self):
        self.memo = WeakTensorKeyDictionary()
        self.next_id = 0

    def _shortid(self, t: torch.Tensor) -> int:
        if t not in self.memo:
            self.memo[t] = self.next_id
            self.next_id += 1
        return self.memo[t]

    def _fmt(self, a: object, with_type: bool = False) -> str:
        if isinstance(a, torch.Tensor):
            # Can also dump real values here, but for realistic models that
            # will be GBs of data.  An alternate strategy is online debugger,
            # where we pause execution inside this handler and allow you
            # to probe the process directly, before continuing on and
            # destructively losing previous state.
            return {
                "dtype": repr(a.dtype),
                "shape": a.shape,
                # TODO: other metadata; consider using MetaTensorDesc
            }
        else:
            return repr(a)

    def __torch_dispatch__(self, func, types, args=(), kwargs=None):
        if kwargs is None:
            kwargs = {}
        rs = func(*args, **kwargs)
        trace_structured("eager_dispatch", metadata_fn=lambda: {
            "args": [tree_map(self._fmt, a) for a in args],
            "kwargs": {k: tree_map(self._fmt, v) for k, v in kwargs.items()},
            "ret": tree_map(self._fmt, rs)
        })
        return rs

if __name__ == '__main__':
    with LoggingMode():
        torch.nn.functional.dropout(torch.randn(3), 0.5)

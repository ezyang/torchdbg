# Usage: TORCH_TRACE=/tmp/test python torchdbg.py  && cat /tmp/test/*

import torch
from torch.utils._python_dispatch import TorchDispatchMode
from torch.utils._pytree import tree_map
import torch.overrides
from torch.utils.weak import WeakTensorKeyDictionary
from torch._logging._internal import trace_structured
from torch._logging.structured import from_traceback, intern_string

import inspect
import traceback
import json
import logging
import weakref
from functools import partial
import itertools
import os
import types


uninteresting_dirs = (
    os.path.dirname(__file__),
    os.path.dirname(inspect.getfile(torch)),
)


def translate_args(f_locals, func):
    sig = inspect.signature(func)
    args = []
    kwargs = {}

    for param in sig.parameters.values():
        if param.name in f_locals:
            if param.kind in (param.POSITIONAL_ONLY, param.POSITIONAL_OR_KEYWORD):
                args.append(f_locals[param.name])
            elif param.kind == param.KEYWORD_ONLY:
                kwargs[param.name] = f_locals[param.name]
            elif param.kind == param.VAR_POSITIONAL:
                args.extend(f_locals[param.name])
            elif param.kind == param.VAR_KEYWORD:
                kwargs.update(f_locals[param.name])

    return args, kwargs


SOURCE_DUMPED = set()

def dump_source(filename: str):
    if filename in SOURCE_DUMPED:
        return
    SOURCE_DUMPED.add(filename)
    trace_structured(
        "dump_source",
        metadata_fn=lambda: {"filename": intern_string(filename)},
        payload_fn=lambda: open(filename, 'r').read()
    )


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

    def _json(self, a: object) -> object:
        if isinstance(a, (list, tuple)):
            # don't bother distinguishing these in json
            return [self._json(b) for b in a]
        elif isinstance(a, dict):
            return {self._json(k): self._json(v) for k, v in a.items()}
        elif isinstance(a, (int, float, bool, str, type(None))):
            return a
        elif isinstance(a, torch.Tensor):
            return {
                "dtype": repr(a.dtype),
                "shape": a.shape,
                # TODO: other metadata; consider using MetaTensorDesc
            }
        else:
            return repr(a)

    def __torch_dispatch__(self, func, tys, args=(), kwargs=None):
        if kwargs is None:
            kwargs = {}

        # Although we know the args/kwargs of the aten operator call,
        # this may be several layers removed from the user code we're
        # actually interested in instrumenting (e.g., imagine a torch
        # API which is implemented in Python and eventually calls into
        # C binding).  We'd like to report the args/kargs of the user
        # call because this is more interpretable to the user.  To do
        # this, we walk up the stack looking for the first frame that
        # looks like user code.
        cur_frame = inner_frame = inspect.currentframe()
        assert inner_frame is not None
        frame = inner_frame.f_back
        while frame:
            if not frame.f_code.co_filename.startswith(uninteresting_dirs):
                break
            inner_frame = frame
            frame = frame.f_back
        # At this point, frame is the user frame (caller), and inner_frame is
        # the callee frame which has the f_locals of the call.  Now we extract
        # the arguments.
        if inner_frame is cur_frame:
            # When the user frame is immediately before the inner frame, that
            # means that the user actually did directly call into a C binding.
            # In this case, the args/kwargs here are accurate-ish.  (The -ish
            # is because our Python bindings sometimes do nontrivial
            # translations of arguments so these args/kwargs may not be
            # exactly what the user actually passed in.  However, these
            # transformations are in principle all known to us and reversible.)
            user_args, user_kwargs = args, kwargs
        else:
            # f_locals is all kwargs, we try to stuff as many positionally as
            # possible, because the user might not even know what a function
            # had named the positional args.
            user_args, user_kwargs = translate_args(
                inner_frame.f_locals,
                types.FunctionType(inner_frame.f_code, inner_frame.f_globals)
            )
        rs = func(*args, **kwargs)
        dump_source(frame.f_code.co_filename)
        trace_structured("eager_dispatch", metadata_fn=lambda: {
            "args": self._json(args),
            "kwargs": self._json(kwargs),
            "user_args": self._json(user_args),
            "user_kwargs": self._json(user_kwargs),
            "user_line": frame.f_lineno,
            "user_name": frame.f_code.co_name,
            "user_filename": intern_string(frame.f_code.co_filename),
            "ret": self._json(rs)
        })
        return rs

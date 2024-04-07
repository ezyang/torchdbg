# Usage: TORCH_TRACE=/tmp/test python torchdbg.py  && cat /tmp/test/*

import torch
from torch.overrides import TorchFunctionMode, resolve_name
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
from collections import defaultdict


uninteresting_dirs = (
    os.path.dirname(__file__),
    os.path.dirname(inspect.getfile(torch)),
)


def translate_args(f_lcls, func):
    sig = inspect.signature(func)
    args = []
    kwargs = {}

    for param in sig.parameters.values():
        if param.name in f_lcls:
            if param.kind in (param.POSITIONAL_ONLY, param.POSITIONAL_OR_KEYWORD):
                args.append(f_lcls[param.name])
            elif param.kind == param.KEYWORD_ONLY:
                kwargs[param.name] = f_lcls[param.name]
            elif param.kind == param.VAR_POSITIONAL:
                args.extend(f_lcls[param.name])
            elif param.kind == param.VAR_KEYWORD:
                kwargs.update(f_lcls[param.name])

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


class LoggingMode(TorchFunctionMode):
    next_id: int

    def __init__(self, skip=0):
        self.memo = WeakTensorKeyDictionary()
        self.next_id = 0
        self.skip = skip
        self.lines_traversed = defaultdict(set)

    def __enter__(self):
        frame = inspect.currentframe()
        for _ in range(self.skip + 1):
            frame = frame.f_back
        self.frame = frame
        super().__enter__()

    def __exit__(self, exc_type, exc_val, exc_tb):
        super().__exit__(exc_type, exc_val, exc_tb)
        del self.frame  # clear reference cycle

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
        elif isinstance(a, torch.nn.Module):
            # TODO: dump these too!
            return "Module()"
        else:
            res = repr(a)
            if len(res) > 100:
                return repr(type(a))
            else:
                return res

    def __torch_function__(self, func, tys, args=(), kwargs=None):
        if kwargs is None:
            kwargs = {}

        # The more complicated user frame plan
        #
        # We would like to record multiple levels of frames, so that we can implement
        # both step and next functionality in the debugger.  However, we don't want to
        # unconditionally dump all the frames, as it's pretty common to be dozens of
        # frame deep from top level launcher code that doesn't matter from the
        # perspective of debugging.
        #
        # Intuitively, we do not need to record source code for any frame whose line
        # number never changes over the course of execution.  Furthermore, once
        # we have identified an unchanged frame, we can bypass traversing all of
        # its parents (which necessarily must also be unchanged).

        stack = []

        # We'll maintain both the inner frame (callee) and the outer frame
        # (caller), because we'd like to report args/kwargs of call sites, and
        # to do that we need to look at the inner frame.  The outer frame is
        # what you traditionally think of as going in the call stack though!
        cur_frame = inner_frame = inspect.currentframe()
        assert inner_frame is not None
        frame = inner_frame.f_back

        def handle_frame(frame, lcls):
            # The first frame is special, because I don't want to actually report
            # the f_lcls of the torch function dispatch, it will often not be
            # well defined
            filename = frame.f_code.co_filename
            file_id = intern_string(filename)
            lcls = dict(lcls)
            if 'self' in lcls:
                del lcls['self']
            stack.append({
                'name': frame.f_code.co_name,
                'line': frame.f_lineno,
                'filename': file_id,
                'locals': self._json(lcls),
            })
            self.lines_traversed[file_id].add(frame.f_lineno)
            if len(self.lines_traversed[file_id]) > 1:
                dump_source(filename)

        while frame:
            if not frame.f_code.co_filename.startswith(uninteresting_dirs):
                handle_frame(frame, frame.f_locals if frame.f_back is not None else {})

            # Stop traversing once we've hit the context manager frame
            if frame is self.frame:
                break

            inner_frame = frame
            frame = frame.f_back

        rs = func(*args, **kwargs)
        trace_structured("eager_dispatch", metadata_fn=lambda: {
            "target": resolve_name(func),
            "stack": stack,
            "args": self._json(args),
            "kwargs": self._json(kwargs),
            "ret": self._json(rs),
        })
        return rs

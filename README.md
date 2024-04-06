# torchdbg

torchdbg is two things:

* A tracer that dumps all PyTorch operations that occur in your program to a
  structured log (formatted compatibly with
  [tlparse](https://github.com/ezyang/tlparse))

* A React UI for visualizing the traces produced above, in the same style
  as a single-stepping debugger.

![image](https://github.com/ezyang/torchdbg/assets/13564/912dff04-fb5d-4ea8-a99c-42e73bb4222f)

This is an Easter vacation hack from @ezyang, I don't currently have plans to
keep pushing this further but maybe the community is willing to pick this up
and run with it.

## How to use

### Python tracer

You need a reasonably recent PyTorch nightly (it needs
https://github.com/pytorch/pytorch/pull/120289) for this to work.

To use the Python tracer, `pip install torchdbg` and then in your
code:

```
import torchdbg

with torchdbg.LoggingMode():
    ...  # your code here
```

By default, we do not log anything: run with `TORCH_TRACE=/tmp/trace`
to specify the log directory.  If you are running a distributed training run,
multiple trace files will be generated per rank.

### React UI

A live version of the UI is here: https://ezyang.github.io/torchdbg/
It is entirely client side, the trace files never leave your browser.
Use the slider at the bottom to advance forward/back in the trace.

To run it locally, first, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Upload one of the generated trace files to the UI.

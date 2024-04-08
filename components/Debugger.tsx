'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, useEffect, useMemo } from 'react';
import { Editor, useMonaco } from '@monaco-editor/react';
import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';

// TODO: make this lazy
import sample from '../example/test.log';

const re_glog = /(?<level>[VIWEC])(?<month>\d{2})(?<day>\d{2}) (?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2}).(?<millisecond>\d{6}) (?<thread>\d+)(?<pathname>[^:]+):(?<line>\d+)\] (?<payload>.)/;

interface IFrame {
  name: string,
  line: number,
  filename: number,
  locals: { [name: string]: object },
}

interface ObjectWithStringIndex {
  [key: string]: object;
}

function eq_frame(a: IFrame, b: IFrame) {
  return a.name === b.name && a.line === b.line && a.filename === b.filename;
}

interface IEntry {
  target: string,
  stack: IFrame[],
  args: object,
  kwargs: object,
  ret: object,
}

class Trace {
  public entries: IEntry[]
  public sourcemap: { [filename: string]: string }
  public strtable: { [id: number]: string }

  constructor() {
    this.entries = [];
    this.sourcemap = {};
    this.strtable = {};
  }
}

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const example = searchParams.get('example') || '';

  const [file, setFile] = useState<string>(sample);
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    // TODO: handle race condition
    const selectedOption = e.target.value;
    if (selectedOption != example) {
      const newSearchParams = new URLSearchParams(searchParams);
      if (selectedOption) {
        newSearchParams.set('example', selectedOption);
      } else {
        newSearchParams.delete('example');
      }
      router.push(`${pathname}?${newSearchParams.toString()}`);
    }

    if (!selectedOption) {
      setFile(sample);
      return;
    }
    setIsLoading(true);
    const response = await fetch("http://ezyang.com/public/" + e.target.value + ".log")
    const result = await response.text();
    setIsLoading(false);
    setFile(result);
  };

  useEffect(() => {
    handleSelectChange({ target: {value: example} } as React.ChangeEvent<HTMLSelectElement>);
  }, [example]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const text = await file.text();
      setFile(text);
    }
  };

  // Our representation of location inside the trace is interesting.
  // Imagine that the trace forms of a tree, where paths are stack traces.
  //
  // At any given point in time, our position is represented by two
  // pieces of data:
  //  - The particular entry (leaf) that is executing (i.e., the description
  //    box below)
  //  - The particular node in the path to leaf, which represents our level
  //    of "zoom" when viewing
  //
  // We want to support zooming in/out, as well as going next/prev at a
  // particular zoom level.  We also want to be able to single step to the
  // next leaf.
  //
  // We continue to maintain all entries in a flat list.  The inefficient
  // implementation is simply to do a linear search to find the next relevant
  // entry.  We implement this for now.
  //
  // One problem is, given a frame in the stack we are zoomed in on, how
  // should this change when we advance a single step?  Some options:
  //
  //  1. Jump straight to innermost frame (as that's the only way to see that
  //     code is changing).
  //  2. Stubbornly stay on the current depth.  This doesn't work once we exit
  //     the frame.
  //
  // We maintain if you wanted to do (2), you should do next.  So step
  // destroys zoom, next preserves zoom.  Because step always goes to
  // inner-most zoom, we will say the innermost zoom is zero for convenience.

  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(0); // 0 = outermost

  const handleStepSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const i = Number(event.target.value)
    setIndex(i);
    setZoom(trace.entries[i].stack.length - 1);
  };

  const handleNav = (sign: number) => {
    // given stack [A, B]
    // and zoom = 1 (focus on B)
    // then path is [A] (does not include zoom)
    const path = entry.stack.slice(0, zoom - 1);
    for (let i = index + sign; i < trace.entries.length && i >= 0; i += sign) {
      const next_entry = trace.entries[i];
      if (next_entry.stack.length < path.length) {
        // We've returned/entered the stack frame we're trying to travel
        break;
      }
      // Check the path has stayed the same
      const next_path = next_entry.stack.slice(0, path.length);
      let ok = true;
      for (let j = 0; j < path.length; j++) {
        if (!eq_frame(path[j], next_path[j])) {
          ok = false;
          break;
        }
      }
      if (!ok) {
        break;
      }

      if (zoom >= next_entry.stack.length) {
        break;
      }

      // Check that the current zoom frame has changed
      // TODO: make this logic suck less
      const next_frame: IFrame = next_entry.stack[zoom];
      if (eq_frame(frame, next_frame) && zoom != next_entry.stack.length - 1) {
        continue;
      }
      if (frame.filename !== next_frame.filename || frame.name !== next_frame.name) {
        break;
      }
      // Also advance if there's no lower frames
      if (frame.line !== next_frame.line || zoom == next_entry.stack.length - 1) {
        setIndex(i);
        break;
      }
      // Some awkwardness here: if a function is called in a loop from the
      // outer context, we will advance into the next call
    }
  };

  const handlePrev = (event: React.MouseEvent<HTMLInputElement>) => {
    handleNav(-1);
  };

  const handleNext = (event: React.MouseEvent<HTMLInputElement>) => {
    handleNav(1);
  };


  const handleUp = (event: React.MouseEvent<HTMLInputElement>) => {
    if (zoom != 0) setZoom(zoom - 1);
  };

  const handleDown = (event: React.MouseEvent<HTMLInputElement>) => {
    if (zoom != entry.stack.length - 1) setZoom(zoom + 1);
  };

  const handleZoomSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setZoom(Number(event.target.value));
  };

  const trace = useMemo(() => {
    const trace = new Trace();
    if (file === null) return trace;
    const lines = file.split('\n');
    let i = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const caps = line.match(re_glog);
      if (caps === null) {
        continue;
      }
      let metadata = null;
      try {
        metadata = JSON.parse(line.slice(caps[0].length - 1));
      } catch (e) {
        continue;
      }
      let payload = ""
      if ("has_payload" in metadata) {
        let first = true;
        for (; i + 1 < lines.length && lines[i + 1].startsWith('\t'); i++) {
          const payload_line = lines[i + 1];
          if (!first) {
            payload += "\n";
          }
          first = false;
          payload += payload_line.slice(1);
        }
        // TODO: test MD5 sum
      }
      if ("str" in metadata) {
        trace.strtable[metadata.str[1]] = metadata.str[0];
      }
      if ("dump_source" in metadata) {
        trace.sourcemap[metadata.dump_source.filename] = payload;
      }
      if ("eager_dispatch" in metadata) {
        const entry = metadata["eager_dispatch"];
        trace.entries.push(entry);
      }
    }
    return trace;
  }, [file]);

  const entry: IEntry = trace.entries[index];
  const frame = entry.stack[zoom];

  const source = frame ? trace.sourcemap[frame.filename] : "";

  const [editor, setEditor] = useState<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const [highlight, setHighlight] = useState<monacoEditor.editor.IEditorDecorationsCollection | null>(null);

  const handleEditorDidMount = (editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: typeof monacoEditor) => {
    setEditor(editor);
    setHighlight(editor.createDecorationsCollection());
  };

  useEffect(() => {
    if (editor && frame && highlight) {
      editor.revealLineInCenter(frame.line);  // zero or one indexed?
      highlight.set([{
        range: new monacoEditor.Range(frame.line, 1, frame.line, 1),
        options: {isWholeLine: true, className: "bg-yellow-300"}}
      ]);
    }
  }, [editor, highlight, frame]);

  const render = (x: object) => {
    if (typeof x == "number" || typeof x == "string" || typeof x == "boolean" || x === null || x === undefined) {
      return <span>{JSON.stringify(x, null, " ")}</span>
    } else if (x instanceof Array) {
      const r = JSON.stringify(x, null, " ");
      if (r.length < 40) {
        return <span>{r}</span>
      } else {
        return <ol className="ml-4">
          {x.map((y: object, i: number) => <li key={i}><span className="text-purple-800 font-bold text-xs">{i}.</span> {render(y)}</li>)}
        </ol>
      }
    } else {
      if ("shape" in x && "dtype" in x) {
        const shape = x.shape as number[];
        const dtype = x.dtype as string;
        return <span>torch.tensor(..., shape=[{shape.join(", ")}], dtype={dtype})</span>
      }
      return <ul>{Object.keys(x).map((k: string) => <li key={k}>{k}: {render((x as ObjectWithStringIndex)[k])}</li>)}</ul>
    }
  };

  const Row = (props: {name: string, value: unknown}) =>
    <tr><th className="text-right align-top">{props.name}:</th><td>{render(props.value as object)}</td></tr>

  return (
    <main className="flex min-h-screen flex-col p-1 bg-gray-200 text-sm">
      <div className="flex flex-row flex-item flex-shrink">
        <div className="flex-item flex-grow">{frame && trace && trace.strtable[frame.filename]}</div>
        <div className="flex-item flex-shrink">
          <input type="file" onChange={handleFileChange} />
          or example:
          <select value={example || ''} onChange={handleSelectChange}>
            <option value=""></option>
            <option value="maskrcnn">maskrcnn</option>
          </select>&nbsp;
          {isLoading && <span className="loader"></span>}
        </div>
      </div>
      <div className="flex-item flex-shrink">
        {file && (
          <Editor
            height="50vh"
            defaultLanguage="javascript"
            value={source}
            onMount={handleEditorDidMount}
            options={{
              readOnly: true,
              minimap: { enabled: false },
            }}
          />
        )}
      </div>
      <div className="flex-item flex-shrink">
        <div>Step: <input
          type="range"
          min="0"
          max={trace.entries.length - 1}
          value={index}
          onChange={handleStepSliderChange}
        />
        </div>
        <div>Zoom: <input
          type="range"
          min="0"
          max={entry.stack.length - 1}
          style={{width: entry.stack.length * 20}}
          value={zoom}
          onChange={handleZoomSliderChange}
        />
        </div>
        <div className="space-x-1 [&>input]:bg-blue-500 hover:[&>input]:bg-blue-700  [&>input]:text-white [&>input]:text-white [&>input]:p-1">
          <input type="submit" value="Prev" onClick={handlePrev} />
          <input type="submit" value="Next" onClick={handleNext} />
          <input type="submit" value="Up" onClick={handleUp} />
          <input type="submit" value="Down" onClick={handleDown} />
        </div>
      </div>
      <div className="flex-item flex-grow flex flex-row pt-2">
        <div className="flex-item flex-1">
          <h2 className="bg-gray-500 text-white pl-2">Locals</h2>
          <ul className="pl-2 pt-2">
            {Object.keys(frame.locals).map((k: string) =>
              <li key={k}><strong>{k}</strong>: {render(frame.locals[k])}</li>
            )}
          </ul>
        </div>
        <div className="flex-item flex-1">
          <h2 className="bg-gray-500 text-white pl-2">PyTorch call</h2>
          <table className="border-separate border-spacing-x-2 pl-2 pt-2">
            <tbody>
              <Row name="target" value={entry.target} />
              <Row name="args" value={entry.args} />
              <Row name="kwargs" value={entry.kwargs} />
              <Row name="ret" value={entry.ret} />
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex-item flex-1 overflow-scroll whitespace-nowrap">
        <h2 className="bg-gray-500 text-white pl-2">Stack</h2>
        <ul className="pl-2 pt-2">
          {entry.stack.map((frame, i) =>
            <li key={i}>File &quot;{trace.strtable[frame.filename]}&quot;, line {frame.line}, in {frame.name}</li>
          )}
        </ul>
      </div>
    </main>
  );
}

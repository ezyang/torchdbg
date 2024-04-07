'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, useEffect, useMemo } from 'react';
import { Editor, useMonaco } from '@monaco-editor/react';
import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';

// TODO: make this lazy
import sample from '../example/test.log';

const re_glog = /(?<level>[VIWEC])(?<month>\d{2})(?<day>\d{2}) (?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2}).(?<millisecond>\d{6}) (?<thread>\d+)(?<pathname>[^:]+):(?<line>\d+)\] (?<payload>.)/;

interface IEntry {
  func: string,
  user_filename: number,
  user_line: number,
  args: object,
  kwargs: object,
  ret: object,
  user_args: object,
  user_kwargs: object,
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
  const [index, setIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    // TODO: handle race condition
    const selectedOption = e.target.value;
    const newSearchParams = new URLSearchParams(searchParams);
    if (selectedOption) {
      newSearchParams.set('example', selectedOption);
    } else {
      newSearchParams.delete('example');
    }
    router.push(`${pathname}?${newSearchParams.toString()}`);

    if (!selectedOption) {
      return;
    }
    setIsLoading(true);
    const response = await fetch("http://ezyang.com/public/" + e.target.value + ".log", {cache: 'force-cache'})
    const result = await response.text();
    setIsLoading(false);
    setFile(result);
  };

  useEffect(() => {
    handleSelectChange({ target: {value: example} } as React.ChangeEvent<HTMLSelectElement>);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const text = await file.text();
      setFile(text);
    }
  };

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setIndex(Number(event.target.value));
  };

  const trace = useMemo(() => {
    if (file === null) return null;
    const lines = file.split('\n');
    let i = -1;
    const trace = new Trace();
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
        const prev_entry = trace.entries.length ? trace.entries.at(-1) : null;
        // TODO: it seems more intuitive to fold these steps together, but
        // that means we're eliding some function information.  Probably want
        // to just clump them together in the display below
        if (!prev_entry || !(prev_entry.user_filename === entry.user_filename && prev_entry.user_line === entry.user_line)) {
          trace.entries.push(entry);
        }
      }
    }
    return trace;
  }, [file]);

  const entry = trace && index < trace.entries.length ? trace.entries[index] : null;

  const source = entry && trace ? trace.sourcemap[entry.user_filename] : "";

  const [editor, setEditor] = useState<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const [highlight, setHighlight] = useState<monacoEditor.editor.IEditorDecorationsCollection | null>(null);

  const handleEditorDidMount = (editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: typeof monacoEditor) => {
    setEditor(editor);
    setHighlight(editor.createDecorationsCollection());
  };

  useEffect(() => {
    if (editor && entry && highlight) {
      editor.revealLineInCenter(entry.user_line);  // zero or one indexed?
      highlight.set([{
        range: new monacoEditor.Range(entry.user_line, 1, entry.user_line, 1),
        options: {isWholeLine: true, className: "highlight"}}
      ]);
    }
  }, [editor, highlight, entry]);

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      or pick an example:
      <select value={example || ''} onChange={handleSelectChange}>
        <option value=""></option>
        <option value="maskrcnn">maskrcnn</option>
        <option value="half">half</option>
      </select>&nbsp;
      {isLoading && <span className="loader"></span>}
      <div>{entry && trace && trace.strtable[entry.user_filename]}</div>
      {file && (
        <Editor
          height="500px"
          defaultLanguage="javascript"
          value={source}
          onMount={handleEditorDidMount}
          options={{
            readOnly: true,
            minimap: { enabled: false },
          }}
        />
      )}
      <input
        type="range"
        min="0"
        max={trace ? trace.entries.length - 1 : 0}
        value={index}
        onChange={handleSliderChange}
      />
      <ul>
        <li>func: {JSON.stringify(entry?.func)}</li>
        <li>args: {JSON.stringify(entry?.args)}</li>
        <li>kwargs: {JSON.stringify(entry?.kwargs)}</li>
        <li>ret: {JSON.stringify(entry?.ret)}</li>
        <li>user_args: {JSON.stringify(entry?.user_args)}</li>
        <li>user_kwargs: {JSON.stringify(entry?.user_kwargs)}</li>
      </ul>
    </div>
  );
}

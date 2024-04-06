'use client';

import dynamic from 'next/dynamic';
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
  const [file, setFile] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    const saved = localStorage.getItem("fileCache");
    if (saved) {
      setFile(saved);
    } else {
      setFile(sample);
    }
    initRef.current = true;
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const text = await file.text();
      setFile(text);
    }
  };

  useEffect(() => {
    if (file !== null && file.length < 20000) {
      localStorage.setItem("fileCache", file);
    }
  }, [file]);

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
        trace.entries.push(metadata["eager_dispatch"]);
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
      <div>{entry && trace.strtable[entry.user_filename]}</div>
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

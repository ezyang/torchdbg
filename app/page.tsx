'use client';

import { useState, useEffect, useMemo } from 'react';
import { Editor, useMonaco } from '@monaco-editor/react';

const re_glog = /(?<level>[VIWEC])(?<month>\d{2})(?<day>\d{2}) (?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2}).(?<millisecond>\d{6}) (?<thread>\d+)(?<pathname>[^:]+):(?<line>\d+)\] (?<payload>.)/;

class Trace {
  public entries: object[]
  public sourcemap: { [filename: string]: string }
  public strtable: { [id: int]: string }

  constructor() {
    this.entries = [];
    this.sourcemap = {};
    this.strtable = {};
  }
}

export default function Home() {
  const [file, setFile] = useState(() => {
    const saved = localStorage.getItem("fileCache");
    return saved || null;
  });
  const [index, setIndex] = useState(0);

  const handleFileChange = async (e) => {
    const text = await e.target.files[0].text();
    setFile(text);
  };

  useEffect(() => {
    if (file !== null) {
      localStorage.setItem("fileCache", file);
    }
  }, [file]);

  const handleSliderChange = (event) => {
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
          const payload_line = lines[i];
          if (!first) {
            payload += "\n";
          }
          first = false;
          payload += lines[i].slice(1);
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

  const entry = trace !== null && index < trace.entries.length ? trace.entries[index] : null;

  const source = entry ? trace.sourcemap[entry.user_filename] : "";

  const monaco = useMonaco();

  useEffect(() => {
    if (monaco && entry) {
      monaco.editor.getEditors()[0].revealLineInCenter(entry.user_line);  // zero or one indexed?
    }
  }, [monaco]);

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      {file && (
        <Editor
          height="600px"
          defaultLanguage="javascript"
          value={source}
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
    </div>
  );
}

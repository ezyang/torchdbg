'use client';

import { useState, useEffect } from 'react';
import { Editor } from '@monaco-editor/react';

export default function Home() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [files, setFiles] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedFile) {
      fetch(`/api/files?file=${encodeURIComponent(selectedFile)}`)
        .then((res) => res.text())
        .then((data) => {
          setFileContent(data);
        })
        .catch((err) => {
          console.error(err);
        });
    }
  }, [selectedFile]);

  async function fetchData() {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      setFiles(data.files);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div>
      <h1>File Viewer</h1>
      <ul>
        {files.map((file) => (
          <li key={file} onClick={() => setSelectedFile(file)}>
            {file}
          </li>
        ))}
      </ul>
      {selectedFile && (
        <Editor
          height="400px"
          defaultLanguage="javascript"
          value={fileContent}
          options={{
            readOnly: true,
            minimap: { enabled: false },
          }}
        />
      )}
    </div>
  );
}

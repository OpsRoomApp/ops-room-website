import { useState, useRef } from 'react';
import ReleaseNotesEditor from '../components/ReleaseNotesEditor.jsx';

const API = '/api/releases/upload';
const INSTALLER_API = '/api/releases/upload-installer';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [channel, setChannel] = useState('stable');
  const [mandatory, setMandatory] = useState(false);
  const [notes, setNotes] = useState('');
  const [codename, setCodename] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  // Installer (EXE) state
  const [instFile, setInstFile] = useState(null);
  const [instUploading, setInstUploading] = useState(false);
  const [instResult, setInstResult] = useState(null);
  const [instError, setInstError] = useState('');
  const [instDragOver, setInstDragOver] = useState(false);
  const instFileRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    const name = f.name || '';
    const re = /^OPS_ROOM_v\d+_\d+_\d+_Public_Windows_x64\.zip$/;
    if (!re.test(name)) {
      setError('Filename must match: OPS_ROOM_vX_XX_XX_Public_Windows_x64.zip');
      return;
    }
    setFile(f);
    setError('');
    setResult(null);
  };

  const handleInstFile = (f) => {
    if (!f) return;
    const name = f.name || '';
    const re = /^OPS_ROOM_Setup_\d+\.\d+\.\d+\.exe$/;
    if (!re.test(name)) {
      setInstError('Filename must match: OPS_ROOM_Setup_X.Y.Z.exe');
      return;
    }
    setInstFile(f);
    setInstError('');
    setInstResult(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError('');
    setResult(null);

    const form = new FormData();
    form.append('file', file);
    form.append('channel', channel);
    form.append('mandatory', String(mandatory));
    form.append('notes', notes);
    form.append('codename', codename);

    try {
      const resp = await fetch(API, { method: 'POST', credentials: 'include', body: form });
      const body = await resp.json();
      if (!resp.ok) {
        setError(body.detail || 'Upload failed');
      } else {
        setResult(body);
        setFile(null);
        setNotes('');
        setCodename('');
        if (fileRef.current) fileRef.current.value = '';
      }
    } catch {
      setError('Network error during upload');
    } finally {
      setUploading(false);
    }
  };

  const handleInstSubmit = async (e) => {
    e.preventDefault();
    if (!instFile) return;

    setInstUploading(true);
    setInstError('');
    setInstResult(null);

    const form = new FormData();
    form.append('file', instFile);

    try {
      const resp = await fetch(INSTALLER_API, { method: 'POST', credentials: 'include', body: form });
      const body = await resp.json();
      if (!resp.ok) {
        setInstError(body.detail || 'Upload failed');
      } else {
        setInstResult(body);
        setInstFile(null);
        if (instFileRef.current) instFileRef.current.value = '';
      }
    } catch {
      setInstError('Network error during upload');
    } finally {
      setInstUploading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">/ UPLOAD RELEASE</h1>

      <div className="card mb-2" style={{ borderColor: 'rgba(255,171,0,0.3)', background: 'rgba(255,171,0,0.03)' }}>
        <div className="card-head">UPLOAD → STAGE → PUBLISH</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          Uploading saves the ZIP and stages it. The release is NOT available to users until you explicitly publish it from the Dashboard.
          Optionally also upload the matching installer EXE (OPS_ROOM_Setup_X.Y.Z.exe) so installer-managed installs update via the installer.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div
          className={`upload-zone mb-2 ${dragOver ? 'dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
        >
          {file ? (
            <p style={{ color: 'var(--acc)' }}>
              <strong>{file.name}</strong><br />
              {(file.size / (1024 * 1024)).toFixed(1)} MB
            </p>
          ) : (
            <p>Drop a release ZIP here or click to select.<br />Filename: OPS_ROOM_vX_XX_XX_Public_Windows_x64.zip</p>
          )}
          <input ref={fileRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files[0])} />
        </div>

        <div className="grid-3 mb-2">
          <div className="form-group">
            <label>Channel</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="stable">stable</option>
              <option value="beta">beta</option>
            </select>
          </div>
          <div className="form-group">
            <label>Mandatory update</label>
            <select value={String(mandatory)} onChange={(e) => setMandatory(e.target.value === 'true')}>
              <option value="false">No (optional)</option>
              <option value="true">Yes (mandatory)</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Codename (optional, e.g. "Polish Pass")</label>
          <input value={codename} onChange={(e) => setCodename(e.target.value)} placeholder="Leave blank to keep existing codename" />
        </div>

        <div className="form-group">
          <label>Release notes (Markdown)</label>
          <ReleaseNotesEditor value={notes} onChange={setNotes} />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>
            The same notes feed the website changelog and the Discord bot, which posts
            new releases to #release-notes and #downloads as itself. Pasted markdown is rendered safely.
          </p>
        </div>

        <button className="btn btn-primary" type="submit" disabled={!file || uploading}>
          {uploading ? 'Uploading...' : 'Upload & Stage'}
        </button>

        {error && <div className="mt-1"><span className="badge badge-err">ERROR</span> {error}</div>}
        {result && (
          <div className="card mt-1">
            <div className="card-head">UPLOAD COMPLETE - STAGED</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              Version {result.version} staged. Go to the Dashboard to publish.
            </div>
            <div className="manifest-preview" style={{ marginTop: '0.75rem' }}>{JSON.stringify(result, null, 2)}</div>
          </div>
        )}
      </form>

      <div className="card mt-2" style={{ borderColor: 'rgba(77,195,255,0.25)', background: 'rgba(77,195,255,0.03)' }}>
        <div className="card-head">INSTALLER (EXE) — OPTIONAL</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          Store the matching installer for the same version. Publishing then advertises it in update.json so
          installer-managed installs update via the installer (loose-folder installs keep using the ZIP).
        </p>
        <form onSubmit={handleInstSubmit}>
          <div
            className={`upload-zone mb-2 ${instDragOver ? 'dragover' : ''}`}
            style={{ minHeight: '4rem' }}
            onDragOver={(e) => { e.preventDefault(); setInstDragOver(true); }}
            onDragLeave={() => setInstDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setInstDragOver(false); handleInstFile(e.dataTransfer.files[0]); }}
            onClick={() => instFileRef.current?.click()}
          >
            {instFile ? (
              <p style={{ color: 'var(--acc)' }}>
                <strong>{instFile.name}</strong><br />
                {(instFile.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            ) : (
              <p>Drop the installer EXE here or click to select.<br />Filename: OPS_ROOM_Setup_X.Y.Z.exe</p>
            )}
            <input ref={instFileRef} type="file" accept=".exe" style={{ display: 'none' }} onChange={(e) => handleInstFile(e.target.files[0])} />
          </div>
          <button className="btn" type="submit" disabled={!instFile || instUploading}>
            {instUploading ? 'Uploading...' : 'Upload installer'}
          </button>
          {instError && <div className="mt-1"><span className="badge badge-err">ERROR</span> {instError}</div>}
          {instResult && (
            <div className="card mt-1">
              <div className="card-head">INSTALLER STORED</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                {instResult.installer_filename} (v{instResult.version}, {instResult.installer_size_mb} MB) attached.
                Publish the version to advertise it in update.json.
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

import { useMemo, useRef, useState } from 'react';
import { Download, ImagePlus, KeyRound, RefreshCw, Sparkles, X } from 'lucide-react';
import { PRESETS } from './presets';
import { generateOne, getKey, setKey } from './gemini';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg','image/png','image/webp'];

function download(src, name) {
  const anchor = document.createElement('a');
  anchor.href = src; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
}

export default function App() {
  const inputRef = useRef(null);
  const [upload, setUpload] = useState(null);
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [count, setCount] = useState(4);
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState('');
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [refineText, setRefineText] = useState('');
  const [refining, setRefining] = useState(false);
  const preset = useMemo(() => PRESETS.find((item) => item.id === presetId) || PRESETS[0], [presetId]);
  const generating = results.some((item) => item.status === 'pending');

  const acceptFile = (file) => {
    setError('');
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) return setError('Please choose a PNG, JPG or WEBP image.');
    if (file.size > MAX_FILE_SIZE) return setError('That image is larger than 20 MB. Please choose a smaller file.');
    const src = URL.createObjectURL(file);
    setUpload((previous) => { if (previous?.owned) URL.revokeObjectURL(previous.src); return {src,name:file.name,owned:true}; });
    setResults([]);
  };

  const run = async () => {
    if (!upload) return setError('Choose a product photo first.');
    if (!getKey()) { setKeyDraft(''); setKeyOpen(true); return; }
    setError('');
    setResults(Array.from({length:count}, () => ({status:'pending'})));
    const completed = await Promise.all(Array.from({length:count}, async (_, index) => {
      try { return {status:'ok',src:await generateOne({preset,referenceSrc:upload.src,variation:`${index+1} of ${count}`})}; }
      catch (cause) { return {status:'error',error:cause.message}; }
    }));
    setResults(completed);
    setHistory((items) => [{id:Date.now(),preset:preset.name,created:new Date(),results:completed.filter((item)=>item.status==='ok')},...items].slice(0,6));
  };

  const retry = async (index) => {
    setResults((items) => items.map((item,i)=>i===index?{status:'pending'}:item));
    try {
      const src = await generateOne({preset,referenceSrc:upload.src,variation:`${index+1} retry`});
      setResults((items) => items.map((item,i)=>i===index?{status:'ok',src}:item));
    } catch (cause) { setResults((items) => items.map((item,i)=>i===index?{status:'error',error:cause.message}:item)); }
  };

  const refine = async () => {
    const result = results[selected];
    if (!result?.src || !refineText.trim()) return;
    setRefining(true); setError('');
    try {
      const src = await generateOne({preset,referenceSrc:result.src,instruction:refineText.trim()});
      setResults((items)=>items.map((item,i)=>i===selected?{status:'ok',src}:item)); setRefineText('');
    } catch (cause) { setError(cause.message); }
    finally { setRefining(false); }
  };

  return <div className="app">
    <header><div className="brand"><div className="brand-icon"><Sparkles size={19}/></div><div><span>Wonder Pads Reusables</span><h1>Photoshoot Generator</h1></div></div><button className="ghost" onClick={()=>{setKeyDraft('');setKeyOpen(true)}}><KeyRound size={16}/> {getKey()?'Change API key':'Connect Gemini'}</button></header>
    <main>
      <aside className="setup">
        <section className="card"><span className="kicker">1 · Product photo</span><h2>Choose your product</h2>
          {!upload ? <button className="upload" onClick={()=>inputRef.current?.click()} onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.preventDefault();acceptFile(e.dataTransfer.files[0])}}><ImagePlus/><b>Drop or choose a photo</b><small>PNG, JPG or WEBP · up to 20 MB</small></button> : <div className="uploaded"><img src={upload.src}/><span>{upload.name}</span><button onClick={()=>{setUpload(null);setResults([])}}><X size={15}/></button></div>}
          <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>acceptFile(e.target.files[0])}/>{error&&<p className="error">{error}</p>}
        </section>
        <section className="card"><span className="kicker">2 · Scene</span><h2>Pick a photoshoot style</h2><div className="presets">{PRESETS.map((item)=><button key={item.id} className={presetId===item.id?'active':''} onClick={()=>setPresetId(item.id)}><img src={item.thumb}/><span>{item.name}</span></button>)}</div></section>
        <section className="card run"><span className="kicker">3 · Generate</span><div className="row"><h2>Variations</h2><div className="count">{[2,4,6].map((n)=><button className={count===n?'active':''} onClick={()=>setCount(n)} key={n}>{n}</button>)}</div></div><button className="primary" disabled={!upload||generating} onClick={run}><Sparkles size={17}/>{generating?'Generating photos…':`Generate ${count} photos`}</button><small>Real Gemini generation · product preservation included</small></section>
      </aside>
      <section className="workspace card"><div className="workspace-head"><div><span className="kicker">Generated photos</span><h2>{preset.name}</h2></div>{results.some((r)=>r.status==='ok')&&<button className="ghost" onClick={()=>results.forEach((r,i)=>r.status==='ok'&&setTimeout(()=>download(r.src,`wonderpads-${preset.id}-${i+1}.png`),i*180))}><Download size={16}/>Download all</button>}</div>
        {!results.length ? <div className="empty"><Sparkles/><h2>Your photoshoot will appear here</h2><p>Upload one clear product photo, choose a scene and generate.</p></div> : <div className="results">{results.map((result,index)=><article key={index} className={selected===index?'selected':''} onClick={()=>result.status==='ok'&&setSelected(index)}>{result.status==='pending'?<div className="pending"><span/><p>Generating variation {index+1}…</p></div>:result.status==='error'?<div className="failed"><p>{result.error}</p><button onClick={(e)=>{e.stopPropagation();retry(index)}}><RefreshCw size={14}/>Retry</button></div>:<><img src={result.src}/><div className="result-actions"><button onClick={(e)=>{e.stopPropagation();retry(index)}}><RefreshCw size={14}/></button><button onClick={(e)=>{e.stopPropagation();download(result.src,`wonderpads-${preset.id}-${index+1}.png`)}}><Download size={14}/></button></div></>}</article>)}</div>}
        {results[selected]?.status==='ok'&&<div className="refine"><div><span className="kicker">Refine variation {selected+1}</span><h2>Ask for one small change</h2></div><textarea value={refineText} onChange={(e)=>setRefineText(e.target.value)} placeholder="e.g. Make the scene slightly brighter; keep the product unchanged."/><button className="primary" disabled={!refineText.trim()||refining} onClick={refine}>{refining?'Applying refinement…':'Apply refinement'}</button></div>}
      </section>
      {history.length>0&&<section className="history card"><span className="kicker">This session</span><h2>Recent generations</h2>{history.map((run)=><div className="history-run" key={run.id}><b>{run.preset}</b><span>{run.results.length} photos</span><div>{run.results.map((r,i)=><img src={r.src} key={i}/>)}</div></div>)}</section>}
    </main>
    {keyOpen&&<div className="overlay" onClick={()=>setKeyOpen(false)}><section className="key-card" onClick={(e)=>e.stopPropagation()}><button className="close" onClick={()=>setKeyOpen(false)}><X/></button><span className="kicker">Private connection</span><h2>Connect Gemini</h2><p>The key is stored only in this browser. We’ll move it behind a secure server before public release.</p><input type="password" value={keyDraft} onChange={(e)=>setKeyDraft(e.target.value)} placeholder="Paste Google AI Studio API key"/><button className="primary" disabled={!keyDraft.trim()} onClick={()=>{setKey(keyDraft);setKeyOpen(false)}}>Save and connect</button></section></div>}
  </div>;
}

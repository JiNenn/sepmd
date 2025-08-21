import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

function App(){
  const [raw, setRaw] = useState<string>(sampleMD.trim())
  const [level, setLevel] = useState<1|2|3>(2)
  const sections = useMemo(()=>splitMarkdownByHeading(raw, level), [raw, level])
  const cardRefs = useRef<(HTMLElement|null)[]>([])
  const [toast, setToast] = useState('')
  const [manual, setManual] = useState<{open:boolean; text:string; onComplete?:()=>void}>({open:false, text:''})

  useEffect(()=>{ if(!toast) return; const t=setTimeout(()=>setToast(''),1800); return ()=>clearTimeout(t) },[toast])

  const scrollToNextCard=(idx:number)=>{
    const next = cardRefs.current[idx+1]
    if(next) next.scrollIntoView({behavior:'smooth', block:'start'})
    else window.scrollTo({top:document.body.scrollHeight, behavior:'smooth'})
  }

  const copySection = async(idx:number)=>{
    const sec = sections[idx]
    const res = await smartCopy(sec.markdown, (text, onComplete)=> setManual({open:true, text, onComplete}))
    if(res!=='manual') scrollToNextCard(idx)
    else setManual({open:true, text:sec.markdown, onComplete:()=>scrollToNextCard(idx)})
    setToast(res==='manual' ? '手動コピーを表示しました' : `セクション ${idx+1} をコピーしました`)
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <h1 className="text-lg font-semibold">Markdown Chunker & Copier</h1>
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="lvl" className="text-sm text-slate-600">分解粒度</label>
            <select id="lvl" value={level} onChange={e=>setLevel(Number(e.target.value) as 1|2|3)} className="rounded-xl border border-slate-300 px-2 py-1 text-sm">
              <option value={1}># (1)</option>
              <option value={2}>#, ## (2)</option>
              <option value={3}>#, ##, ### (3)</option>
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pb-28">
        <section className="mt-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-medium">貼り付け（Markdown）</h2>
              <div className="flex gap-2">
                <button className="text-xs px-2 py-1 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={()=>setRaw('')}>クリア</button>
                <button className="text-xs px-2 py-1 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={()=>setRaw(sampleMD.trim())}>サンプル読込</button>
              </div>
            </div>
            <textarea value={raw} onChange={e=>setRaw(e.target.value)} rows={18} spellCheck={false} placeholder="# 見出しで分解されます。生成AIの回答をそのまま貼り付けてください。" className="w-full rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-400 focus:outline-none p-3 font-mono text-sm" />
            <p className="mt-2 text-xs text-slate-500">粒度 1: # のみ | 粒度 2: # と ## | 粒度 3: #, ##, ### が境界</p>
          </div>
        </section>

        <section className="mt-6">
          {sections.map((sec, i)=> (
            <article key={sec.id} ref={el=>cardRefs.current[i]=el} className="bg-white my-6 rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-slate-500">Section {i+1}</div>
                <button onClick={()=>copySection(i)} className="text-xs px-3 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 active:translate-y-[1px]" aria-label={`セクション${i+1}をコピー`}>
                  セクションをコピー
                </button>
              </div>

              <div className="prose prose-slate max-w-none font-sans">
                <MarkdownWithCopy raw={sec.markdown} onManualCopy={(text, onComplete)=> setManual({open:true, text, onComplete})} />
              </div>
            </article>
          ))}
        </section>
      </main>

      <div className={`fixed bottom-5 right-5 transition-all ${toast? 'opacity-100 translate-y-0':'opacity-0 translate-y-2'}`}>
        <div className="bg-slate-900 text-white text-sm px-3 py-2 rounded-xl shadow-lg">{toast}</div>
      </div>

      <ManualCopyModal open={manual.open} text={manual.text} onClose={()=>setManual({open:false, text:''})} onCopied={()=>{ const cb=manual.onComplete; setManual({open:false, text:'', onComplete:undefined}); cb?.(); setToast('コピー（手動）完了') }} />
    </div>
  )
}

function MarkdownWithCopy({ raw, onManualCopy }: { raw:string; onManualCopy:(text:string, onComplete?:()=>void)=>void }){
  const counter = useRef(0)

  // ★ 型付けした Components オブジェクトを用意（inline プロパティを安全に受け取れる）
  const mdComponents = {
    code({ node, inline, className, children, ...props }: any){
      const code = String(children ?? '')
      if(inline){
        return <code className="bg-slate-100 rounded px-1 py-0.5 font-mono text-[0.9em]" {...props}>{children}</code>
      }
      counter.current += 1
      const id = counter.current
      return <CodeBlock id={`code-${id}`} code={code} lang={extractLang(className)} onManualCopy={onManualCopy} />
    },
    // Headings with gradient and stronger hierarchy
    h1({ children, ...props }: any){
      return <h1 className="mt-8 mb-3 text-3xl font-extrabold leading-tight bg-gradient-to-r from-fuchsia-600 to-sky-600 bg-clip-text text-transparent" {...props}>{children}</h1>
    },
    h2({ children, ...props }: any){
      return <h2 className="mt-7 mb-3 text-2xl font-bold leading-snug bg-gradient-to-r from-fuchsia-500 to-sky-500 bg-clip-text text-transparent" {...props}>{children}</h2>
    },
    h3({ children, ...props }: any){
      return <h3 className="mt-6 mb-2 text-xl font-semibold text-slate-800" {...props}>{children}</h3>
    },
    h4({ children, ...props }: any){
      return <h4 className="mt-5 mb-2 text-lg font-semibold text-slate-800" {...props}>{children}</h4>
    },
    // Lists and quotes with flashy bullets and bars
    ul({ children, ...props }: any){
      return <ul className="pl-6 my-3 space-y-1" {...props}>{children}</ul>
    },
    ol({ children, ...props }: any){
      return <ol className="pl-6 my-3 space-y-1 list-decimal" {...props}>{children}</ol>
    },
    li({ children, ...props }: any){
      return <li className="relative pl-5 before:content-['✦'] before:text-fuchsia-600 before:absolute before:left-0 before:top-1" {...props}>{children}</li>
    },
    blockquote({ children, ...props }: any){
      return (
        <blockquote className="border-l-4 border-fuchsia-300 pl-4 my-4 text-slate-700 italic bg-fuchsia-50/40 rounded-r-xl" {...props}>
          {children}
        </blockquote>
      )
    },
    a({ children, href, ...props }: any){
      return <a href={href} className="text-sky-700 underline decoration-2 underline-offset-4 hover:text-sky-900" {...props}>{children}</a>
    },
    hr(props: any){
      return <hr className="my-6 border-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" {...props} />
    },
    table(props: any){
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm rounded-xl overflow-hidden shadow-sm" {...props} />
        </div>
      )
    },
    th(props: any){ return <th className="px-3 py-2 text-left bg-slate-100/80 text-slate-700" {...props} /> },
    td(props: any){ return <td className="px-3 py-2 border-t border-slate-200" {...props} /> },
    pre({ children }: any){ return <>{children}</> },
  } satisfies Components

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{raw}</ReactMarkdown>
  )
}

function CodeBlock({ id, code, lang, onManualCopy }:{ id:string; code:string; lang?:string; onManualCopy:(text:string, onComplete?:()=>void)=>void }){
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement|null>(null)

  useEffect(()=>{
    const p = (window as any).Prism
    if(p && ref.current){ p.highlightAllUnder(ref.current) }
  }, [code, lang])

  const alignBottom=()=>{
    const el = ref.current
    if(!el) return
    const rect = el.getBoundingClientRect()
    const targetTop = Math.max(0, window.scrollY + rect.bottom - window.innerHeight)
    window.scrollTo({ top: targetTop, behavior: 'smooth' })
  }

  const onCopy = async()=>{
    const res = await smartCopy(code, (text, onComplete)=> onManualCopy(text, onComplete))
    if(res==='manual'){
      onManualCopy(code, ()=>{ setCopied(true); alignBottom() })
    }else{
      setCopied(true); alignBottom()
    }
    setTimeout(()=>setCopied(false), 1600)
  }

  return (
    <div
      id={id}
      ref={ref}
      className={`relative rounded-2xl overflow-hidden border shadow-sm ${copied? 'border-fuchsia-400 bg-fuchsia-50/40':'border-slate-200 bg-slate-50'}`}
    >
      <div className="flex items-center justify-between px-3 py-2 text-xs text-white bg-gradient-to-r from-slate-900 to-slate-800">
        <span className="font-mono">{lang? lang : 'code'}</span>
        <button onClick={onCopy} aria-label="コードをコピー" className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:translate-y-[1px]">
          {copied? 'コピー済み' : 'コピー'}
        </button>
      </div>
      <pre className="line-numbers m-0 p-3 overflow-x-auto text-sm leading-6">
        <code className={`language-${lang ?? 'text'}`}>{code}</code>
      </pre>
    </div>
  )
}

async function smartCopy(text:string, requestManual:(text:string, onComplete?:()=>void)=>void): Promise<'clipboard'|'exec'|'manual'>{
  try{
    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(text)
      return 'clipboard'
    }
    throw new Error('NoAsyncClipboard')
  }catch(e){
    if(copyWithExecCommand(text)) return 'exec'
    requestManual(text)
    return 'manual'
  }
}

function copyWithExecCommand(text:string): boolean{
  try{
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly','')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    document.body.appendChild(ta)
    ta.select()
    const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false
    document.body.removeChild(ta)
    return !!ok
  }catch(e){
    console.warn('execCommand fallback failed', e)
    return false
  }
}

function ManualCopyModal({ open, text, onClose, onCopied }:{ open:boolean; text:string; onClose:()=>void; onCopied:()=>void }){
  const ref = useRef<HTMLTextAreaElement|null>(null)
  useEffect(()=>{ if(open && ref.current){ ref.current.focus(); ref.current.select() } },[open])
  if(!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
      <div className="w-full sm:max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Manual Copy (permissions restricted)</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">✕</button>
        </div>
        <p className="text-sm text-slate-600 mb-2">Ctrl/Cmd + C でコピー。テキストは自動選択されます。</p>
        <textarea ref={ref} value={text} readOnly className="w-full h-48 border border-slate-300 rounded-xl p-3 font-mono text-sm" />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300">Close</button>
          <button onClick={onCopied} className="px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white">Copied</button>
        </div>
      </div>
    </div>
  )
}

function extractLang(className?:string){
  if(!className) return undefined
  const m = className.match(/language-([a-zA-Z0-9#.+-]+)/)
  return m?.[1]
}

function splitMarkdownByHeading(src:string, level:1|2|3){
  const lines = src.replace(/\r\n?/g,'\n').split('\n')
  const chunks: {id:number; markdown:string}[] = []
  let buf:string[] = []
  let inFence=false
  let fenceChar: '`'|'~'|null = null
  let id=1
  const push=()=>{ const text = buf.join('\n').trim(); if(text.length>0) chunks.push({id:id++, markdown:text}); buf=[] }
  for(let i=0;i<lines.length;i++){
    const line = lines[i]
    const trimmed = line.trim()
    if(/^```/.test(trimmed) || /^~~~/.test(trimmed)){
      const opener = trimmed.startsWith('```') ? '`' : '~'
      if(!inFence){ inFence=true; fenceChar=opener }
      else if(fenceChar && ((fenceChar==='`' && /^```/.test(trimmed)) || (fenceChar==='~' && /^~~~/.test(trimmed)))){ inFence=false; fenceChar=null }
      buf.push(line); continue
    }
    if(!inFence){
      const m = trimmed.match(/^(#{1,6})\s+.+/)
      if(m){ const h = m[1].length; if(h<=level){ if(buf.length>0) push(); buf.push(line); continue } }
    }
    buf.push(line)
  }
  if(buf.length>0) push()
  return chunks
}



const sampleMD = `# タイトル\n\n概要テキスト。ここは # が出るまでの前文です。\n\n## 使い方\n- 左にMarkdownを貼り付け\n- 右上ドロップダウンで分解粒度を選択\n- 各セクションの「セクションをコピー」を押すと次のセクションへスクロール\n\n### 注意\n- コードフェンス内の # は分割対象になりません\n- 表やチェックボックス (GFM) に対応\n\n## コード例\n\n\`\`\`ts\nexport function hello(name: string){\n  return 'Hello, '+name\n}\n\`\`\`\n\n### さらにコード\n\`\`\`python\nimport sys\nprint('ok', sys.version)\n\`\`\`\n\n## 表\n\n| 指標 | 値 | 年 |\n| --- | ---: | ---: |\n| CO2強度 | 410 | 2024 |\n| CO2強度 | 380 | 2023 |\n`

createRoot(document.getElementById('root')!).render(<App />)
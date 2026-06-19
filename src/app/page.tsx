'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  ComposedChart, BarChart, LineChart, AreaChart,
  Bar, Line, Area, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts'
import {
  Home, User, Building2, TrendingUp, Upload, Settings, X, Plus, Check,
  ArrowLeft, Trash2, FileText, HardDrive, Zap, RefreshCw, Edit2, CreditCard,
  Filter, CheckSquare, Square, Tag, Calendar, SlidersHorizontal, Link2, Inbox,
} from 'lucide-react'
import {
  supabase, loadAllData, loadAllTransactions, saveAccount, deleteAccount, updateAccount,
  saveTransactions, updateTransaction, deleteTransaction, deleteTransactions, recategorizeTransactions,
  saveImovel, updateImovel, deleteImovel, linkContaImovel, unlinkContaImovel,
  assignTransactionToImovel, assignTransactionsToImovel,
  type Account, type Transaction, type Imovel, type ImovelRenda, type ContaImovel,
} from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────
const T = {
  bg:'#0B0B12', surface:'#13131C', surface2:'#1C1C28', surface3:'#242435',
  text:'#EEF1F8', textSec:'#858EA3', textTer:'#3C455C', border:'#1F2236',
  green:'#4ADE80', red:'#F87171', mono:"'ui-monospace','SF Mono',monospace",
}
const PAL: Record<string,{grad:string,accent:string,soft:string}> = {
  familiar:   {grad:'linear-gradient(145deg,#2b160d,#9a4f2c)',accent:'#E0875F',soft:'#2a1710'},
  pessoal:    {grad:'linear-gradient(145deg,#06291b,#0d5c39)',accent:'#34D399',soft:'#0a2419'},
  imoveis:    {grad:'linear-gradient(145deg,#0a1f3d,#15448a)',accent:'#60A5FA',soft:'#0e1f3a'},
  patrimonio: {grad:'linear-gradient(145deg,#17171d,#3a3a46)',accent:'#AEB6C6',soft:'#1c1c24'},
}
const tagPal = (tag:string) => tag==='investimento' ? PAL.imoveis : (PAL[tag] ?? PAL.pessoal)
const PROP_GRAD = {pos:'linear-gradient(145deg,#042b1c,#0d5c38)',neg:'linear-gradient(145deg,#1c0808,#7f1d1d)'}
const CAT_LIST = ['Alimentação','Casa','Transporte','Saúde','Educação','Lazer','Pessoal','Subscrições','Financeiro','Takeaway','Outros','Receita','Transferência']
const CAT_META: Record<string,{cor:string,icon:string}> = {
  'Alimentação':{cor:'#4ADE80',icon:'🛒'}, 'Casa':{cor:'#A78BFA',icon:'🏠'},
  'Casa / Renda':{cor:'#A78BFA',icon:'🏠'}, 'Transporte':{cor:'#22D3EE',icon:'🚗'},
  'Saúde':{cor:'#38BDF8',icon:'🏥'}, 'Educação':{cor:'#F472B6',icon:'🎓'},
  'Lazer':{cor:'#FBBF24',icon:'🎭'}, 'Pessoal':{cor:'#FB923C',icon:'👗'},
  'Subscrições':{cor:'#FB7185',icon:'📱'}, 'Financeiro':{cor:'#94A3B8',icon:'💳'},
  'Takeaway':{cor:'#F97316',icon:'🛵'}, 'Outros':{cor:'#64748B',icon:'📦'},
  'Receita':{cor:'#4ADE80',icon:'💰'}, 'Transferência':{cor:'#94A3B8',icon:'🔄'},
}
const getCatStyle = (nome:string) => CAT_META[nome] ?? CAT_META['Outros']
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ─────────────────────────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// FORMATTERS — milhares com espaço, decimais com vírgula (# ##0,00)
// ─────────────────────────────────────────────────────────────────
const big = (n:number) => (n<0?'− ':'')+'€'+Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,' ')
const dec = (n:number) => {
  const a=Math.abs(n),i=Math.floor(a)
  return '€'+i.toString().replace(/\B(?=(\d{3})+(?!\d))/g,' ')+','+Math.round((a-i)*100).toString().padStart(2,'0')
}
const sgn = (n:number) => (n>=0?'+ ':'− ')+dec(n)
// Converte input do utilizador (aceita vírgula ou ponto decimal, espaços nos milhares) para número
const parseNum = (s:string) => {
  if(!s) return 0
  // remove espaços (milhares), troca vírgula decimal por ponto
  const clean = s.replace(/\s/g,'').replace(',','.')
  const n = Number(clean)
  return isNaN(n) ? 0 : n
}
// Converte YYYY-MM-DD (ISO do Supabase) → DD/MM/AAAA para exibição
const fmtDate = (d:string|null|undefined):string => {
  if(!d) return ''
  const parts = d.split('-')
  if(parts.length!==3) return d
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
function getMonthLabel(offset:number) {
  const d = new Date(); d.setMonth(d.getMonth()+offset)
  return MONTHS_SHORT[d.getMonth()]
}
function accountSaldo(a:Account) {
  return a.tipo === 'cartão' ? -Math.abs(a.saldo_atual) : a.saldo_atual
}

function computeView(accounts:Account[], transactions:Transaction[], tag:string, selId:string|null) {
  const accs = accounts.filter(a=>a.budget_tag===tag && (selId?a.id===selId:true))
  if (!accs.length) return {saldo:0,rec:0,desp:0,net:0,cats:[],trend:[],txns:[]}
  const ids = new Set(accs.map(a=>a.id))
  const txns = transactions.filter(t=>ids.has(t.account_id))
  const saldo = accs.reduce((s,a)=>s+accountSaldo(a),0)
  const rec = txns.filter(t=>t.valor>0).reduce((s,t)=>s+t.valor,0)
  const desp = txns.filter(t=>t.valor<0).reduce((s,t)=>s+Math.abs(t.valor),0)
  const catMap:Record<string,number> = {}
  txns.filter(t=>t.valor<0&&t.categoria).forEach(t=>{ catMap[t.categoria!]=(catMap[t.categoria!]||0)+Math.abs(t.valor) })
  const totalDesp = Object.values(catMap).reduce((s,v)=>s+v,0)||1
  const cats = Object.entries(catMap).map(([nome,v])=>({nome,v,pct:Math.round(v/totalDesp*100),...getCatStyle(nome)})).sort((a,b)=>b.v-a.v)
  const trend = Array.from({length:5},(_,i)=>{
    const offset=i-4; const d=new Date(); d.setMonth(d.getMonth()+offset)
    const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const mt=txns.filter(t=>t.data.startsWith(ym))
    const mRec=mt.filter(t=>t.valor>0).reduce((s,t)=>s+t.valor,0)
    const mDesp=mt.filter(t=>t.valor<0).reduce((s,t)=>s+Math.abs(t.valor),0)
    return {m:getMonthLabel(offset),rec:mRec,desp:mDesp,net:+(mRec-mDesp).toFixed(2)}
  })
  return {saldo,rec,desp,net:+(rec-desp).toFixed(2),cats,trend,txns:txns.slice(0,8)}
}

// ─────────────────────────────────────────────────────────────────
// UI ATOMS
// ─────────────────────────────────────────────────────────────────
const Card = ({children,style}:{children:React.ReactNode,style?:React.CSSProperties}) => (
  <div style={{background:T.surface,borderRadius:14,border:`1px solid ${T.border}`,overflow:'hidden',...style}}>{children}</div>
)
const Lbl = ({title,action,accent,onAction}:{title:string,action?:string,accent?:string,onAction?:()=>void}) => (
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'0 2px'}}>
    <span style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase'}}>{title}</span>
    {action&&<span onClick={onAction} style={{fontSize:12,color:accent,fontWeight:600,cursor:'pointer'}}>{action}</span>}
  </div>
)
const Btn = ({children,onClick,variant='primary',accent,style={}}:{children:React.ReactNode,onClick?:()=>void,variant?:string,accent?:string,style?:React.CSSProperties}) => {
  const v:Record<string,React.CSSProperties> = {
    primary:{background:accent,color:'#0B0B12',padding:'10px 18px',fontSize:13},
    ghost:{background:T.surface2,color:T.text,padding:'10px 18px',fontSize:13},
    danger:{background:'rgba(248,113,113,0.15)',color:T.red,padding:'10px 18px',fontSize:13},
  }
  return <button onClick={onClick} style={{border:'none',borderRadius:10,cursor:'pointer',fontWeight:600,...v[variant],...style}}>{children}</button>
}
const Inp = ({label,value,onChange,placeholder,type='text'}:{label:string,value:string,onChange:(v:string)=>void,placeholder?:string,type?:string}) => (
  <div style={{marginBottom:14}}>
    <div style={{fontSize:11,color:T.textSec,fontWeight:600,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>{label}</div>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{width:'100%',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px',color:T.text,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
  </div>
)
// Campo monetário: aceita vírgula decimal e espaços, teclado numérico no telemóvel
const MoneyInp = ({label,value,onChange,placeholder,hint}:{label:string,value:string,onChange:(v:string)=>void,placeholder?:string,hint?:string}) => (
  <div style={{marginBottom:14}}>
    <div style={{fontSize:11,color:T.textSec,fontWeight:600,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>{label}</div>
    <input inputMode="decimal" value={value} onChange={e=>onChange(e.target.value.replace(/[^0-9.,\s-]/g,''))} placeholder={placeholder??'0,00'}
      style={{width:'100%',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px',color:T.text,fontSize:13,outline:'none',boxSizing:'border-box',fontFamily:T.mono}}/>
    {hint&&<div style={{fontSize:11,color:T.textSec,marginTop:5,lineHeight:1.5}}>{hint}</div>}
  </div>
)
const Sel = ({label,value,onChange,options}:{label:string,value:string,onChange:(v:string)=>void,options:{value:string,label:string}[]}) => (
  <div style={{marginBottom:14}}>
    <div style={{fontSize:11,color:T.textSec,fontWeight:600,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>{label}</div>
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{width:'100%',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px',color:T.text,fontSize:13,outline:'none',boxSizing:'border-box',appearance:'none' as any}}>
      {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
)

// ─────────────────────────────────────────────────────────────────
// CHARTS
// ─────────────────────────────────────────────────────────────────
const Leg = ({c,l,line}:{c:string,l:string,line?:boolean}) => (
  <div style={{display:'flex',alignItems:'center',gap:4}}><div style={{width:line?10:7,height:line?2:7,borderRadius:line?1:2,background:c}}/><span style={{fontSize:9,color:'rgba(255,255,255,0.38)'}}>{l}</span></div>
)
const Spark = ({trend}:{trend:{m:string,rec:number,desp:number,net:number}[]}) => (
  <>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
      <span style={{fontSize:9,color:'rgba(255,255,255,0.28)',textTransform:'uppercase',letterSpacing:'0.07em',fontWeight:600}}>Tendência — 5 meses</span>
      <div style={{display:'flex',gap:10}}><Leg c={T.green} l="Rec" line/><Leg c={T.red} l="Desp" line/><Leg c="rgba(255,255,255,0.4)" l="Saldo"/></div>
    </div>
    <div style={{height:50}}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={trend} margin={{top:4,right:0,bottom:0,left:0}}>
          <Bar dataKey="net" fill="rgba(255,255,255,0.18)" radius={[2,2,0,0]} maxBarSize={16}/>
          <Line dataKey="rec" stroke={T.green} strokeWidth={1.75} dot={false}/>
          <Line dataKey="desp" stroke={T.red} strokeWidth={1.75} dot={false}/>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:2}}>
      {trend.map((d,i)=><span key={i} style={{fontSize:9,color:'rgba(255,255,255,0.2)',flex:1,textAlign:'center'}}>{d.m}</span>)}
    </div>
  </>
)
const Toggle = ({val,set,accent}:{val:string,set:(v:string)=>void,accent:string}) => (
  <div style={{display:'flex',background:T.surface2,borderRadius:8,padding:2,gap:1}}>
    {['Bar','Linha','Área'].map(t=>(<button key={t} onClick={()=>set(t)} style={{padding:'3px 9px',borderRadius:6,border:'none',cursor:'pointer',background:val===t?accent:'transparent',color:val===t?'#0B0B12':T.textSec,fontSize:10,fontWeight:val===t?700:400,transition:'all 0.12s'}}>{t}</button>))}
  </div>
)
const DynChart = ({data,type}:{data:{m:string,rec:number,desp:number}[],type:string}) => {
  const tip = <Tooltip contentStyle={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,fontSize:12}} formatter={(v:any,k:string)=>[dec(v),k==='rec'?'Receitas':'Despesas']} labelStyle={{color:T.text,fontWeight:600}} cursor={{fill:'rgba(255,255,255,0.03)'}}/>
  const ax = <XAxis dataKey="m" tick={{fontSize:11,fill:T.textSec}} axisLine={false} tickLine={false}/>
  return (
    <ResponsiveContainer width="100%" height={120}>
      {type==='Bar'?(<BarChart data={data} barCategoryGap="25%" barGap={3}>{ax}<YAxis hide/>{tip}<Bar dataKey="rec" fill="rgba(74,222,128,0.4)" radius={[4,4,0,0]} maxBarSize={26}/><Bar dataKey="desp" fill="rgba(248,113,113,0.4)" radius={[4,4,0,0]} maxBarSize={26}/></BarChart>
      ):type==='Linha'?(<LineChart data={data}>{ax}<YAxis hide/>{tip}<Line dataKey="rec" stroke={T.green} strokeWidth={2} dot={{fill:T.green,r:3,strokeWidth:0}}/><Line dataKey="desp" stroke={T.red} strokeWidth={2} dot={{fill:T.red,r:3,strokeWidth:0}}/></LineChart>
      ):(<AreaChart data={data}>{ax}<YAxis hide/>{tip}<Area dataKey="rec" stroke={T.green} strokeWidth={2} fill="rgba(74,222,128,0.12)"/><Area dataKey="desp" stroke={T.red} strokeWidth={2} fill="rgba(248,113,113,0.12)"/></AreaChart>)}
    </ResponsiveContainer>
  )
}
const TrendTile = ({data,accent}:{data:{m:string,rec:number,desp:number}[],accent:string}) => {
  const [type,setType] = useState('Linha')
  return (
    <div style={{marginBottom:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'0 2px'}}>
        <span style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase'}}>Evolução mensal</span>
        <Toggle val={type} set={setType} accent={accent}/>
      </div>
      <Card style={{padding:'14px 14px 8px'}}><DynChart data={data} type={type}/></Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────────
const Hero = ({pal,title,mainValue,mainColor,kpis,trend,period,mainSuffix}:{pal:{grad:string,accent:string,soft:string},title:string,mainValue:string,mainColor?:string,kpis:{l:string,v:string,c:string}[],trend:{m:string,rec:number,desp:number,net:number}[],period:string,mainSuffix?:string}) => (
  <div style={{background:pal.grad,borderRadius:18,padding:'20px 18px 16px',marginBottom:16,border:'1px solid rgba(255,255,255,0.05)'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
      <div>
        <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600,marginBottom:5}}>{title}</div>
        <div style={{display:'flex',alignItems:'baseline',gap:6}}>
          <div style={{fontSize:32,fontWeight:700,color:mainColor??'#FFF',letterSpacing:'-0.03em',fontFamily:T.mono}}>{mainValue}</div>
          {mainSuffix&&<span style={{fontSize:12,color:'rgba(255,255,255,0.3)'}}>{mainSuffix}</span>}
        </div>
      </div>
      <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',fontWeight:500,marginTop:4}}>{period}</div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:`repeat(${kpis.length},1fr)`,gap:6,marginBottom:14}}>
      {kpis.map((k,i)=>(<div key={i} style={{background:'rgba(255,255,255,0.08)',borderRadius:10,padding:'9px 10px'}}><div style={{fontSize:9,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.07em',fontWeight:600,marginBottom:3}}>{k.l}</div><div style={{fontSize:kpis.length===4?11:12,fontWeight:700,color:k.c,fontFamily:T.mono}}>{k.v}</div></div>))}
    </div>
    <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:10}}><Spark trend={trend}/></div>
  </div>
)

// ─────────────────────────────────────────────────────────────────
// ACCOUNTS LIST
// ─────────────────────────────────────────────────────────────────
const AccountList = ({accounts,sel,onSel,pal}:{accounts:Account[],sel:string|null,onSel:(id:string|null)=>void,pal:{accent:string,soft:string}}) => (
  <div style={{marginBottom:20}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'0 2px'}}>
      <span style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase'}}>Contas</span>
      {sel&&<button onClick={()=>onSel(null)} style={{display:'flex',alignItems:'center',gap:4,background:pal.soft,border:'none',borderRadius:8,padding:'3px 8px',cursor:'pointer'}}><span style={{fontSize:11,color:pal.accent,fontWeight:600}}>Ver tudo</span><X size={11} color={pal.accent}/></button>}
    </div>
    {accounts.length===0&&<Card><div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem contas. Adiciona nas Definições.</div></Card>}
    {accounts.length>0&&(
      <Card>
        {accounts.map((c,i)=>{
          const active=sel===c.id, saldo=accountSaldo(c), isCard=c.tipo==='cartão'
          return (
            <div key={c.id} onClick={()=>onSel(active?null:c.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',borderBottom:i<accounts.length-1?`1px solid ${T.border}`:'none',borderLeft:active?`3px solid ${pal.accent}`:'3px solid transparent',background:active?pal.soft:'transparent',cursor:'pointer',transition:'all 0.12s'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                {isCard&&<CreditCard size={15} color={T.textSec}/>}
                <div><div style={{fontSize:13,fontWeight:active?700:500,color:active?pal.accent:T.text}}>{c.nome}</div><div style={{fontSize:11,color:T.textSec,marginTop:1}}>{c.titular} · {c.banco}{isCard?' · cartão':''}</div></div>
              </div>
              <div style={{fontSize:15,fontWeight:700,color:saldo<0?T.red:(active?pal.accent:T.text),fontFamily:T.mono}}>{saldo<0?'− ':''}{dec(saldo)}</div>
            </div>
          )
        })}
      </Card>
    )}
  </div>
)

// ─────────────────────────────────────────────────────────────────
// CATEGORY + TXN ROWS
// ─────────────────────────────────────────────────────────────────
const CatRow = ({nome,v,pct,cor,icon,last}:{nome:string,v:number,pct:number,cor:string,icon:string,last:boolean}) => (
  <div style={{padding:'10px 16px',borderBottom:last?'none':`1px solid ${T.border}`}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
      <div style={{display:'flex',alignItems:'center',gap:9}}><span style={{fontSize:16}}>{icon}</span><span style={{fontSize:13,color:T.text}}>{nome}</span></div>
      <div style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:10,color:T.textTer,fontWeight:500}}>{pct}%</span><span style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:T.mono,minWidth:72,textAlign:'right'}}>{dec(v)}</span></div>
    </div>
    <div style={{height:3,borderRadius:2,background:T.border}}><div style={{width:`${pct}%`,height:'100%',borderRadius:2,background:cor}}/></div>
  </div>
)
const TxnRow = ({t,last,onClick}:{t:Transaction,last:boolean,onClick?:()=>void}) => (
  <div onClick={onClick} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',borderBottom:last?'none':`1px solid ${T.border}`,cursor:onClick?'pointer':'default'}}>
    <div style={{width:38,height:38,borderRadius:12,background:T.surface2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,flexShrink:0}}>{getCatStyle(t.categoria??'Outros').icon}</div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:13,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.descritivo}</div>
      <div style={{fontSize:11,color:T.textSec,marginTop:2}}>{t.categoria??'Sem categoria'} · {t.data}</div>
    </div>
    {onClick&&<Edit2 size={13} color={T.textTer} style={{flexShrink:0}}/>}
    <div style={{fontSize:13,fontWeight:700,color:t.valor>=0?T.green:T.red,fontFamily:T.mono,whiteSpace:'nowrap'}}>{t.valor>=0?'+ ':'− '}{dec(t.valor)}</div>
  </div>
)

// ─────────────────────────────────────────────────────────────────
// TRANSACTION EDIT FORM
// ─────────────────────────────────────────────────────────────────
const TxnEditForm = ({txn,onClose,onSaved,pal,imoveis}:{txn:Transaction,onClose:()=>void,onSaved:()=>void,pal:{accent:string,soft:string},imoveis?:Imovel[]}) => {
  const [descritivo,setDescritivo] = useState(txn.descritivo)
  const [valor,setValor] = useState(String(txn.valor))
  const [categoria,setCategoria] = useState(txn.categoria??'Outros')
  const [data,setData] = useState(txn.data)
  const [tipo,setTipo] = useState(txn.valor>=0?'receita':'despesa')
  const [imovelId,setImovelId] = useState(txn.imovel_id ?? '')
  const [saving,setSaving] = useState(false)
  const hasImoveis = imoveis && imoveis.length>0

  const submit = async () => {
    setSaving(true)
    const absVal = Math.abs(parseNum(valor))
    const finalVal = tipo==='receita' ? absVal : -absVal
    const fields:any = { descritivo, valor:finalVal, categoria, data, categoria_confirmada:true }
    if(hasImoveis){
      fields.imovel_id = imovelId || null
      fields.imovel_classificado = true
    }
    await updateTransaction(txn.id, fields)
    await onSaved(); setSaving(false); onClose()
  }
  const del = async () => {
    if(!confirm('Apagar esta transação?')) return
    setSaving(true); await deleteTransaction(txn.id); await onSaved(); setSaving(false); onClose()
  }

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:120,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:'20px 20px 0 0',width:'100%',maxWidth:440,maxHeight:'88vh',overflow:'auto',padding:'0 0 24px'}}>
        <div style={{display:'flex',alignItems:'center',padding:'16px 18px',borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,background:T.surface}}>
          <div style={{flex:1,fontSize:15,fontWeight:700,color:T.text}}>Editar Transação</div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer'}}><X size={18} color={T.textSec}/></button>
        </div>
        <div style={{padding:'20px 18px'}}>
          <Inp label="Descritivo" value={descritivo} onChange={setDescritivo}/>
          <Sel label="Tipo" value={tipo} onChange={setTipo} options={[{value:'despesa',label:'🔴 Despesa'},{value:'receita',label:'🟢 Receita'}]}/>
          <MoneyInp label="Valor (€)" value={valor.replace('-','')} onChange={setValor}/>
          <Sel label="Categoria" value={categoria} onChange={setCategoria} options={CAT_LIST.map(c=>({value:c,label:`${getCatStyle(c).icon} ${c}`}))}/>
          {hasImoveis&&<Sel label="Imóvel associado" value={imovelId} onChange={setImovelId} options={[{value:'',label:'Geral (nenhum imóvel)'},...imoveis!.map(im=>({value:im.id,label:`🏠 ${im.nome}`}))]}/>}
          <Inp label="Data" value={data} onChange={setData} type="date"/>
          <div style={{display:'flex',gap:10,marginTop:4}}>
            <Btn onClick={del} variant="danger" accent={pal.accent} style={{flex:1}}>Apagar</Btn>
            <Btn onClick={submit} variant="primary" accent={pal.accent} style={{flex:2}}>{saving?'A guardar…':'Guardar'}</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// FILTER SHEET
// ─────────────────────────────────────────────────────────────────
type Filters = { dateFrom:string, dateTo:string, tipo:string, valMin:string, valMax:string, categoria:string }
const emptyFilters:Filters = { dateFrom:'', dateTo:'', tipo:'todos', valMin:'', valMax:'', categoria:'todas' }

const FilterSheet = ({filters,onApply,onClose,pal}:{filters:Filters,onApply:(f:Filters)=>void,onClose:()=>void,pal:{accent:string,soft:string}}) => {
  const [f,setF] = useState<Filters>(filters)
  const upd = (k:keyof Filters)=>(v:string)=>setF({...f,[k]:v})
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:120,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:'20px 20px 0 0',width:'100%',maxWidth:440,maxHeight:'88vh',overflow:'auto',padding:'0 0 24px'}}>
        <div style={{display:'flex',alignItems:'center',padding:'16px 18px',borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,background:T.surface}}>
          <div style={{flex:1,fontSize:15,fontWeight:700,color:T.text}}>Filtros</div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer'}}><X size={18} color={T.textSec}/></button>
        </div>
        <div style={{padding:'20px 18px'}}>
          <div style={{fontSize:11,color:T.textTer,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:10}}>Intervalo de datas</div>
          <div style={{display:'flex',gap:10}}>
            <div style={{flex:1}}><Inp label="De" value={f.dateFrom} onChange={upd('dateFrom')} type="date"/></div>
            <div style={{flex:1}}><Inp label="Até" value={f.dateTo} onChange={upd('dateTo')} type="date"/></div>
          </div>
          <Sel label="Tipo de transação" value={f.tipo} onChange={upd('tipo')} options={[{value:'todos',label:'Todas'},{value:'receita',label:'🟢 Só receitas'},{value:'despesa',label:'🔴 Só despesas'}]}/>
          <div style={{fontSize:11,color:T.textTer,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:10}}>Intervalo de valores (€)</div>
          <div style={{display:'flex',gap:10}}>
            <div style={{flex:1}}><Inp label="Mínimo" value={f.valMin} onChange={upd('valMin')} type="number"/></div>
            <div style={{flex:1}}><Inp label="Máximo" value={f.valMax} onChange={upd('valMax')} type="number"/></div>
          </div>
          <Sel label="Categoria" value={f.categoria} onChange={upd('categoria')} options={[{value:'todas',label:'Todas as categorias'},...CAT_LIST.map(c=>({value:c,label:`${getCatStyle(c).icon} ${c}`}))]}/>
          <div style={{display:'flex',gap:10,marginTop:4}}>
            <Btn onClick={()=>{setF(emptyFilters);onApply(emptyFilters);onClose()}} variant="ghost" accent={pal.accent} style={{flex:1}}>Limpar</Btn>
            <Btn onClick={()=>{onApply(f);onClose()}} variant="primary" accent={pal.accent} style={{flex:2}}>Aplicar filtros</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// BATCH RECATEGORIZE SHEET
// ─────────────────────────────────────────────────────────────────
const RecategorizeSheet = ({count,onApply,onClose,pal}:{count:number,onApply:(cat:string)=>void,onClose:()=>void,pal:{accent:string,soft:string}}) => {
  const [cat,setCat] = useState('Outros')
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:130,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:'20px 20px 0 0',width:'100%',maxWidth:440,padding:'0 0 24px'}}>
        <div style={{display:'flex',alignItems:'center',padding:'16px 18px',borderBottom:`1px solid ${T.border}`}}>
          <div style={{flex:1,fontSize:15,fontWeight:700,color:T.text}}>Recategorizar {count} transações</div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer'}}><X size={18} color={T.textSec}/></button>
        </div>
        <div style={{padding:'20px 18px'}}>
          <Sel label="Nova categoria" value={cat} onChange={setCat} options={CAT_LIST.map(c=>({value:c,label:`${getCatStyle(c).icon} ${c}`}))}/>
          <Btn onClick={()=>onApply(cat)} variant="primary" accent={pal.accent} style={{width:'100%'}}>Aplicar a {count} transações</Btn>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// ALL TRANSACTIONS SCREEN
// ─────────────────────────────────────────────────────────────────
const AllTransactionsScreen = ({allTxns,accounts,tag,pal,onClose,onRefresh,imoveis}:{allTxns:Transaction[],accounts:Account[],tag:string,pal:{grad:string,accent:string,soft:string},onClose:()=>void,onRefresh:()=>void,imoveis?:Imovel[]}) => {
  const [filters,setFilters] = useState<Filters>(emptyFilters)
  const [showFilters,setShowFilters] = useState(false)
  const [selectMode,setSelectMode] = useState(false)
  const [selected,setSelected] = useState<Set<string>>(new Set())
  const [editTxn,setEditTxn] = useState<Transaction|null>(null)
  const [showRecat,setShowRecat] = useState(false)

  // Contas da tab activa
  const tagAccountIds = useMemo(()=>new Set(accounts.filter(a=>a.budget_tag===tag).map(a=>a.id)),[accounts,tag])

  // Aplicar filtros
  const filtered = useMemo(()=>{
    return allTxns.filter(t=>{
      if(!tagAccountIds.has(t.account_id)) return false
      if(filters.dateFrom && t.data < filters.dateFrom) return false
      if(filters.dateTo && t.data > filters.dateTo) return false
      if(filters.tipo==='receita' && t.valor<0) return false
      if(filters.tipo==='despesa' && t.valor>=0) return false
      if(filters.categoria!=='todas' && t.categoria!==filters.categoria) return false
      const abs = Math.abs(t.valor)
      if(filters.valMin && abs < Number(filters.valMin)) return false
      if(filters.valMax && abs > Number(filters.valMax)) return false
      return true
    })
  },[allTxns,tagAccountIds,filters])

  const activeFilterCount = Object.entries(filters).filter(([k,v])=>v && v!=='todos' && v!=='todas').length
  const totalRec = filtered.filter(t=>t.valor>0).reduce((s,t)=>s+t.valor,0)
  const totalDesp = filtered.filter(t=>t.valor<0).reduce((s,t)=>s+Math.abs(t.valor),0)

  const toggleSel = (id:string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }
  const selectAll = () => {
    if(selected.size===filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(t=>t.id)))
  }
  const doDelete = async () => {
    if(!confirm(`Apagar ${selected.size} transações?`)) return
    await deleteTransactions(Array.from(selected))
    setSelected(new Set()); setSelectMode(false); await onRefresh()
  }
  const doRecat = async (cat:string) => {
    await recategorizeTransactions(Array.from(selected), cat)
    setShowRecat(false); setSelected(new Set()); setSelectMode(false); await onRefresh()
  }

  // Agrupar por mês
  const grouped = useMemo(()=>{
    const g:Record<string,Transaction[]> = {}
    filtered.forEach(t=>{
      const [y,m] = t.data.split('-')
      const key = `${MONTHS_FULL[Number(m)-1]} ${y}`
      ;(g[key] ||= []).push(t)
    })
    return g
  },[filtered])

  return (
    <div style={{position:'fixed',inset:0,background:T.bg,zIndex:80,overflowY:'auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <div style={{maxWidth:440,margin:'0 auto'}}>
        {/* Header */}
        <div style={{position:'sticky',top:0,zIndex:10,background:T.surface,borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px'}}>
            <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ArrowLeft size={18} color={T.textSec}/></button>
            <div style={{fontSize:16,fontWeight:700,color:T.text,flex:1}}>Todas as transações</div>
            <button onClick={()=>setShowFilters(true)} style={{position:'relative',background:activeFilterCount?pal.soft:T.surface2,border:'none',borderRadius:10,padding:'7px 10px',cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
              <SlidersHorizontal size={14} color={activeFilterCount?pal.accent:T.textSec}/>
              {activeFilterCount>0&&<span style={{fontSize:11,fontWeight:700,color:pal.accent}}>{activeFilterCount}</span>}
            </button>
            <button onClick={()=>{setSelectMode(!selectMode);setSelected(new Set())}} style={{background:selectMode?pal.accent:T.surface2,border:'none',borderRadius:10,padding:'7px 10px',cursor:'pointer'}}>
              <CheckSquare size={14} color={selectMode?'#0B0B12':T.textSec}/>
            </button>
          </div>
          {/* Summary bar */}
          <div style={{display:'flex',gap:16,padding:'0 16px 12px'}}>
            <div style={{fontSize:12,color:T.textSec}}>{filtered.length} transações</div>
            <div style={{fontSize:12,color:T.green,fontWeight:600}}>↑ {dec(totalRec)}</div>
            <div style={{fontSize:12,color:T.red,fontWeight:600}}>↓ {dec(totalDesp)}</div>
          </div>
          {/* Select-all bar */}
          {selectMode&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',background:pal.soft,borderTop:`1px solid ${T.border}`}}>
              <button onClick={selectAll} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',cursor:'pointer'}}>
                {selected.size===filtered.length&&filtered.length>0?<CheckSquare size={16} color={pal.accent}/>:<Square size={16} color={T.textSec}/>}
                <span style={{fontSize:12,color:pal.accent,fontWeight:600}}>{selected.size>0?`${selected.size} selecionadas`:'Selecionar todas'}</span>
              </button>
            </div>
          )}
        </div>

        {/* List grouped by month */}
        <div style={{padding:'14px 14px 100px'}}>
          {filtered.length===0&&<Card><div style={{padding:32,textAlign:'center',color:T.textSec,fontSize:13}}>Nenhuma transação corresponde aos filtros.</div></Card>}
          {Object.entries(grouped).map(([month,txns])=>(
            <div key={month} style={{marginBottom:18}}>
              <div style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8,padding:'0 2px'}}>{month}</div>
              <Card>
                {txns.map((t,i)=>{
                  const isSel = selected.has(t.id)
                  return (
                    <div key={t.id} onClick={()=>selectMode?toggleSel(t.id):setEditTxn(t)} style={{display:'flex',alignItems:'center',gap:11,padding:'11px 14px',borderBottom:i<txns.length-1?`1px solid ${T.border}`:'none',cursor:'pointer',background:isSel?pal.soft:'transparent',transition:'background 0.12s'}}>
                      {selectMode&&<div style={{flexShrink:0}}>{isSel?<CheckSquare size={18} color={pal.accent}/>:<Square size={18} color={T.textTer}/>}</div>}
                      <div style={{width:36,height:36,borderRadius:11,background:T.surface2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>{getCatStyle(t.categoria??'Outros').icon}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.descritivo}</div>
                        <div style={{fontSize:11,color:T.textSec,marginTop:2}}>{t.categoria??'Sem categoria'} · {t.data}</div>
                      </div>
                      {!selectMode&&<Edit2 size={13} color={T.textTer} style={{flexShrink:0}}/>}
                      <div style={{fontSize:13,fontWeight:700,color:t.valor>=0?T.green:T.red,fontFamily:T.mono,whiteSpace:'nowrap'}}>{t.valor>=0?'+ ':'− '}{dec(t.valor)}</div>
                    </div>
                  )
                })}
              </Card>
            </div>
          ))}
        </div>

        {/* Batch action bar */}
        {selectMode && selected.size>0 && (
          <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:440,background:T.surface,borderTop:`1px solid ${T.border}`,padding:'12px 16px 20px',display:'flex',gap:10,zIndex:20}}>
            <Btn onClick={()=>setShowRecat(true)} variant="ghost" accent={pal.accent} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}><Tag size={15}/> Recategorizar</Btn>
            <Btn onClick={doDelete} variant="danger" accent={pal.accent} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}><Trash2 size={15}/> Apagar ({selected.size})</Btn>
          </div>
        )}
      </div>

      {showFilters&&<FilterSheet filters={filters} onApply={setFilters} onClose={()=>setShowFilters(false)} pal={pal}/>}
      {editTxn&&<TxnEditForm txn={editTxn} onClose={()=>setEditTxn(null)} onSaved={onRefresh} pal={pal} imoveis={imoveis}/>}
      {showRecat&&<RecategorizeSheet count={selected.size} onApply={doRecat} onClose={()=>setShowRecat(false)} pal={pal}/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PROPERTY HERO
// ─────────────────────────────────────────────────────────────────
const PropHero = ({im,renda,custos}:{im:Imovel,renda:number,custos:number}) => {
  const res=renda-custos, pos=res>=0, ac=pos?T.green:T.red
  return (
    <div style={{background:pos?PROP_GRAD.pos:PROP_GRAD.neg,borderRadius:14,padding:'15px 16px',marginBottom:10,border:'1px solid rgba(255,255,255,0.06)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
        <div><div style={{fontSize:14,fontWeight:700,color:'#FFF'}}>{im.nome}</div><div style={{fontSize:11,color:'rgba(255,255,255,0.4)',marginTop:2}}>{im.local}</div></div>
        <div style={{textAlign:'right'}}><div style={{fontSize:19,fontWeight:700,color:ac,fontFamily:T.mono}}>{pos?'+ ':'− '}{dec(Math.abs(res))}</div><div style={{fontSize:9,color:'rgba(255,255,255,0.28)',marginTop:1}}>resultado/mês</div></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
        {[{l:'Renda',v:dec(renda),c:T.green},{l:'Custos',v:dec(custos),c:T.red},{l:'Estado',v:im.ativo?'Arrendado':'Sem renda',c:im.ativo?T.green:'rgba(255,255,255,0.35)'}].map((k,i)=>(<div key={i} style={{background:'rgba(255,255,255,0.09)',borderRadius:8,padding:'8px 10px'}}><div style={{fontSize:9,color:'rgba(255,255,255,0.35)',textTransform:'uppercase',letterSpacing:'0.06em',fontWeight:600,marginBottom:2}}>{k.l}</div><div style={{fontSize:11,fontWeight:700,color:k.c,fontFamily:T.mono}}>{k.v}</div></div>))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────
const LoginScreen = ({onLogin}:{onLogin:()=>void}) => {
  const [email,setEmail] = useState('')
  const [pass,setPass] = useState('')
  const [err,setErr] = useState('')
  const [loading,setLoading] = useState(false)
  const login = async () => {
    setLoading(true); setErr('')
    const {error} = await supabase.auth.signInWithPassword({email,password:pass})
    if (error) { setErr(error.message); setLoading(false) } else onLogin()
  }
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:T.bg,padding:24,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <div style={{width:'100%',maxWidth:360}}>
        <div style={{textAlign:'center',marginBottom:40}}><div style={{fontSize:32,fontWeight:800,color:T.text,letterSpacing:'-0.03em'}}>Finance<span style={{color:PAL.familiar.accent}}>.</span></div><div style={{fontSize:14,color:T.textSec,marginTop:8}}>Controlo financeiro pessoal</div></div>
        <Card style={{padding:24}}>
          <Inp label="Email" value={email} onChange={setEmail} placeholder="o-teu@email.com" type="email"/>
          <Inp label="Password" value={pass} onChange={setPass} placeholder="••••••••" type="password"/>
          {err&&<div style={{fontSize:12,color:T.red,marginBottom:12}}>{err}</div>}
          <button onClick={login} disabled={loading} style={{width:'100%',background:PAL.familiar.accent,color:'#0B0B12',border:'none',borderRadius:10,padding:'12px',fontSize:14,fontWeight:700,cursor:'pointer'}}>{loading?'A entrar…':'Entrar'}</button>
        </Card>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// ACCOUNT FORM
// ─────────────────────────────────────────────────────────────────
const emptyForm = {nome:'',banco:'',tipo:'corrente',budget_tag:'familiar',titular:'',ownership_pct:'50',saldo_atual:'0',iban:'',numero_conta:''}
type FormState = typeof emptyForm
const AccountForm = ({initial,onClose,onSaved,pal,accountsLen}:{initial:Account|null,onClose:()=>void,onSaved:()=>void,pal:{accent:string,soft:string},accountsLen:number}) => {
  const [form,setForm] = useState<FormState>(initial ? {
    nome:initial.nome, banco:initial.banco, tipo:initial.tipo, budget_tag:initial.budget_tag,
    titular:initial.titular??'', ownership_pct:String(initial.ownership_pct),
    saldo_atual:String(initial.saldo_atual), iban:initial.iban??'', numero_conta:initial.numero_conta??'',
  } : emptyForm)
  const [saving,setSaving] = useState(false)
  const isEdit = !!initial
  const f = (k:keyof FormState) => (v:string) => { const next:FormState={...form,[k]:v}; if(k==='budget_tag') next.ownership_pct=v==='pessoal'?'100':'50'; setForm(next) }
  const submit = async () => {
    if(!form.nome||!form.banco) return
    setSaving(true)
    const payload = { nome:form.nome, banco:form.banco, tipo:form.tipo as any, budget_tag:form.budget_tag as any, titular:form.titular, ownership_pct:Number(form.ownership_pct), saldo_atual:parseNum(form.saldo_atual), iban:form.iban||null, numero_conta:form.numero_conta||null }
    if(isEdit) await updateAccount(initial!.id, payload)
    else await saveAccount({...payload, moeda:'EUR', ativa:true, ordem:accountsLen})
    await onSaved(); setSaving(false); onClose()
  }
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:110,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:'20px 20px 0 0',width:'100%',maxWidth:440,maxHeight:'88vh',overflow:'auto',padding:'0 0 24px'}}>
        <div style={{display:'flex',alignItems:'center',padding:'16px 18px',borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,background:T.surface}}>
          <div style={{flex:1,fontSize:15,fontWeight:700,color:T.text}}>{isEdit?'Editar Conta':'Nova Conta'}</div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer'}}><X size={18} color={T.textSec}/></button>
        </div>
        <div style={{padding:'20px 18px'}}>
          <Inp label="Nome personalizado" value={form.nome} onChange={f('nome')} placeholder="ex: Família Abanca Cici"/>
          <Inp label="Banco / Fonte" value={form.banco} onChange={f('banco')} placeholder="ex: Abanca, Revolut…"/>
          <Sel label="Tipo" value={form.tipo} onChange={f('tipo')} options={[{value:'corrente',label:'Conta Corrente'},{value:'poupança',label:'Poupança'},{value:'cartão',label:'Cartão de Crédito'},{value:'corretora',label:'Corretora'}]}/>
          <Sel label="Budget" value={form.budget_tag} onChange={f('budget_tag')} options={[{value:'familiar',label:'🟠 Familiar'},{value:'pessoal',label:'🟢 Pessoal'},{value:'investimento',label:'🔵 Investimento'}]}/>
          <Inp label="Titular" value={form.titular} onChange={f('titular')} placeholder="ex: Eu, Cici, Conjunto"/>
          <Inp label="% propriedade" value={form.ownership_pct} onChange={f('ownership_pct')} type="number"/>
          {isEdit ? (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:T.textSec,fontWeight:600,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Saldo actual</div>
              <div style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px',color:T.textSec,fontSize:13,fontFamily:T.mono}}>{dec(Number(form.saldo_atual)||0)}</div>
              <div style={{fontSize:11,color:T.textSec,marginTop:5,lineHeight:1.5}}>Actualizado automaticamente a cada extracto importado. Não é editável manualmente.</div>
            </div>
          ) : (
            <MoneyInp label={form.tipo==='cartão'?'Valor inicial em dívida (€)':'Saldo inicial (€)'} value={form.saldo_atual} onChange={f('saldo_atual')} hint="Ponto de partida antes do primeiro extracto importado. Depois passa a ser actualizado automaticamente."/>
          )}
          <Inp label="IBAN (opcional)" value={form.iban} onChange={f('iban')} placeholder="PT50 0000 0000 0000 0000 0000 0"/>
          <Inp label="Número de conta (opcional)" value={form.numero_conta} onChange={f('numero_conta')} placeholder="ex: 0000 0000 0000"/>
          <div style={{display:'flex',gap:10}}>
            <Btn onClick={onClose} variant="ghost" accent={pal.accent} style={{flex:1}}>Cancelar</Btn>
            <Btn onClick={submit} variant="primary" accent={pal.accent} style={{flex:2}}>{saving?'A guardar…':(isEdit?'Guardar alterações':'Criar conta')}</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────
const SettingsPanel = ({onClose,accounts,onRefresh,pal}:{onClose:()=>void,accounts:Account[],onRefresh:()=>void,pal:{accent:string,soft:string}}) => {
  const [formOpen,setFormOpen] = useState(false)
  const [editing,setEditing] = useState<Account|null>(null)
  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (a:Account) => { setEditing(a); setFormOpen(true) }
  const del = async (id:string) => { if(!confirm('Apagar esta conta? As transações associadas também serão removidas.')) return; await deleteAccount(id); await onRefresh() }
  return (
    <div style={{position:'fixed',inset:0,background:T.bg,zIndex:90,overflowY:'auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <div style={{maxWidth:440,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:T.surface,borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,zIndex:10}}>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ArrowLeft size={18} color={T.textSec}/></button>
          <div style={{fontSize:16,fontWeight:700,color:T.text,flex:1}}>Definições</div>
          <button onClick={onRefresh} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><RefreshCw size={16} color={T.textSec}/></button>
        </div>
        <div style={{padding:'16px 14px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,padding:'0 2px'}}>
            <span style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase'}}>Contas ({accounts.length})</span>
            <button onClick={openNew} style={{display:'flex',alignItems:'center',gap:4,background:pal.soft,border:'none',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}><Plus size={12} color={pal.accent}/><span style={{fontSize:11,color:pal.accent,fontWeight:600}}>Adicionar</span></button>
          </div>
          <Card style={{marginBottom:20}}>
            {accounts.map((a,i)=>{
              const p=tagPal(a.budget_tag)
              return (
                <div key={a.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderBottom:i<accounts.length-1?`1px solid ${T.border}`:'none'}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:p.accent,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.nome}</div><div style={{fontSize:11,color:T.textSec}}>{a.banco} · {a.titular} · {a.ownership_pct}%{a.iban?` · ${a.iban.slice(0,8)}…`:''}</div></div>
                  <button onClick={()=>openEdit(a)} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><Edit2 size={14} color={pal.accent}/></button>
                  <button onClick={()=>del(a.id)} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><Trash2 size={14} color={T.textTer}/></button>
                </div>
              )
            })}
            {!accounts.length&&<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem contas configuradas.</div>}
          </Card>
          <button onClick={async()=>{await supabase.auth.signOut();window.location.reload()}} style={{width:'100%',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px',color:T.red,fontSize:13,fontWeight:600,cursor:'pointer'}}>Terminar sessão</button>
        </div>
      </div>
      {formOpen&&<AccountForm initial={editing} onClose={()=>setFormOpen(false)} onSaved={onRefresh} pal={pal} accountsLen={accounts.length}/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// IMPORT WIZARD
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// IMPORT WIZARD — real PDF parsing via Gemini + preview
// ─────────────────────────────────────────────────────────────────
type ParsedTxn = { id:number; data:string; descritivo:string; valor:number; categoria:string; keep:boolean }

const ImportWizard = ({onClose,accounts,pal,onDone}:{onClose:()=>void,accounts:Account[],pal:{grad:string,accent:string,soft:string},onDone:()=>void}) => {
  const [step,setStep] = useState<1|2|3>(1)
  const [selAccount,setSelAccount] = useState('')
  const [parsing,setParsing] = useState(false)
  const [parseError,setParseError] = useState('')
  const [fileName,setFileName] = useState('')
  const [parsed,setParsed] = useState<ParsedTxn[]>([])
  const [meta,setMeta] = useState<{saldo_final:number|null,iban:string|null,numero_conta:string|null}>({saldo_final:null,iban:null,numero_conta:null})
  const [saving,setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const selAccObj = accounts.find(a=>a.id===selAccount)

  const handleFile = async (e:React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if(!file) return
    setFileName(file.name)
    setParsing(true)
    setParseError('')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/parse', {method:'POST', body:form})
      const data = await res.json()
      if(!res.ok || data.error) throw new Error(data.error || `Erro ${res.status}`)
      if(!data.transactions?.length) throw new Error('Nenhuma transação encontrada. Verifica se o ficheiro tem extratos.')
      setParsed(data.transactions.map((t:any,i:number)=>({
        id:i, data:t.data, descritivo:t.descritivo, valor:Number(t.valor),
        categoria: Number(t.valor)>=0 ? 'Receita' : 'Outros', keep:true,
      })))
      setMeta({
        saldo_final: data.meta?.saldo_final ?? null,
        iban: data.meta?.iban ?? null,
        numero_conta: data.meta?.numero_conta ?? null,
      })
      setStep(3)
    } catch(err:any) {
      setParseError(err.message)
    } finally {
      setParsing(false)
    }
  }

  const toggleKeep = (id:number) => setParsed(p=>p.map(t=>t.id===id?{...t,keep:!t.keep}:t))
  const setCat = (id:number,cat:string) => setParsed(p=>p.map(t=>t.id===id?{...t,categoria:cat}:t))
  const toSave = parsed.filter(t=>t.keep)

  const confirmImport = async () => {
    setSaving(true)
    const txns = toSave.map((t,i)=>({
      account_id:selAccount, data:t.data, descritivo:t.descritivo, valor:t.valor,
      categoria:t.categoria, categoria_confirmada:false, ai_confianca:null,
      excluir_analise:false, imovel_classificado:false,
      hash:`${selAccount}-${t.data}-${t.descritivo.slice(0,20)}-${t.valor}-${Date.now()}-${i}`,
      import_batch_id:null, imovel_id:null, notas:null, subcategoria:null, descritivo_norm:null,
    }))
    await saveTransactions(txns as any)

    // Actualiza saldo da conta com o saldo final do extrato (sempre que disponível)
    // e preenche IBAN/número de conta apenas se ainda estiverem vazios
    if(selAccObj){
      const updates:any = {}
      if(meta.saldo_final !== null) updates.saldo_atual = meta.saldo_final
      if(meta.iban && !selAccObj.iban) updates.iban = meta.iban
      if(meta.numero_conta && !selAccObj.numero_conta) updates.numero_conta = meta.numero_conta
      if(Object.keys(updates).length) await updateAccount(selAccObj.id, updates)
    }

    await onDone(); setSaving(false); onClose()
  }

  const totalRec = toSave.filter(t=>t.valor>0).reduce((s,t)=>s+t.valor,0)
  const totalDesp = toSave.filter(t=>t.valor<0).reduce((s,t)=>s+Math.abs(t.valor),0)
  const stepLabel = step===1?'Conta':step===2?'Ficheiro':'Confirmar'

  return (
    <div onClick={()=>!parsing&&onClose()} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:100,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={handleFile} style={{display:'none'}}/>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:'20px 20px 0 0',width:'100%',maxWidth:440,maxHeight:'92vh',display:'flex',flexDirection:'column',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'}}>
        {/* Header */}
        <div style={{flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 18px',borderBottom:`1px solid ${T.border}`}}>
            {step>1&&!parsing&&<button onClick={()=>{setStep(s=>(s-1) as any);setParseError('')}} style={{background:'none',border:'none',cursor:'pointer'}}><ArrowLeft size={18} color={T.textSec}/></button>}
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700,color:T.text}}>Importar Extracto</div>
              <div style={{fontSize:11,color:T.textSec}}>Passo {step} de 3 — {stepLabel}</div>
            </div>
            <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer'}}><X size={18} color={T.textSec}/></button>
          </div>
          <div style={{height:3,background:T.border}}><div style={{height:'100%',width:`${step/3*100}%`,background:pal.accent,transition:'width 0.3s'}}/></div>
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:'auto',padding:'20px 18px'}}>

          {/* PASSO 1: seleccionar conta */}
          {step===1&&(
            <div>
              <div style={{fontSize:13,color:T.textSec,marginBottom:16}}>Para qual conta é este extracto?</div>
              {accounts.length===0&&<Card><div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Cria primeiro uma conta nas Definições.</div></Card>}
              {accounts.map(a=>(
                <div key={a.id} onClick={()=>setSelAccount(a.id)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:T.surface2,borderRadius:12,marginBottom:8,cursor:'pointer',border:`1px solid ${selAccount===a.id?pal.accent:T.border}`,transition:'border 0.12s'}}>
                  <div><div style={{fontSize:13,fontWeight:600,color:T.text}}>{a.nome}</div><div style={{fontSize:11,color:T.textSec,marginTop:1}}>{a.banco} · {a.titular}</div></div>
                  {selAccount===a.id&&<Check size={16} color={pal.accent}/>}
                </div>
              ))}
            </div>
          )}

          {/* PASSO 2: upload + estado */}
          {step===2&&(
            <div>
              {!parsing&&!parseError&&(
                <>
                  <div style={{fontSize:13,color:T.textSec,marginBottom:16}}>Selecciona o ficheiro do extrato:</div>
                  <div onClick={()=>fileRef.current?.click()} style={{display:'flex',alignItems:'center',gap:14,padding:'16px',background:T.surface2,borderRadius:12,marginBottom:10,cursor:'pointer',border:`1px solid ${T.border}`}}>
                    <div style={{width:44,height:44,borderRadius:12,background:pal.soft,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><FileText size={22} color={pal.accent}/></div>
                    <div><div style={{fontSize:14,fontWeight:600,color:T.text}}>Upload do dispositivo</div><div style={{fontSize:12,color:T.textSec,marginTop:2}}>PDF, Excel ou CSV · Qualquer banco</div></div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:14,padding:'16px',background:T.surface2,borderRadius:12,opacity:0.45,border:`1px solid ${T.border}`}}>
                    <div style={{width:44,height:44,borderRadius:12,background:T.surface3,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><HardDrive size={22} color={T.textSec}/></div>
                    <div><div style={{fontSize:14,fontWeight:600,color:T.text}}>Google Drive</div><div style={{fontSize:12,color:T.textSec,marginTop:2}}>Em breve</div></div>
                  </div>
                </>
              )}
              {parsing&&(
                <div style={{textAlign:'center',padding:'32px 0'}}>
                  <div style={{width:56,height:56,borderRadius:16,background:pal.soft,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}><Zap size={26} color={pal.accent}/></div>
                  <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>A processar o PDF…</div>
                  <div style={{fontSize:12,color:T.textSec,marginBottom:2}}>📄 {fileName}</div>
                  <div style={{fontSize:12,color:T.textTer}}>O Gemini está a ler o extrato. Pode demorar até 15 segundos.</div>
                </div>
              )}
              {parseError&&(
                <div>
                  <div style={{textAlign:'center',padding:'24px 0 16px'}}>
                    <div style={{fontSize:15,fontWeight:700,color:T.red,marginBottom:8}}>Erro no parsing</div>
                    <div style={{fontSize:13,color:T.textSec,lineHeight:1.6,marginBottom:20}}>{parseError}</div>
                  </div>
                  <Btn onClick={()=>{setParseError('');fileRef.current?.click()}} variant="primary" accent={pal.accent} style={{width:'100%',marginBottom:10}}>Tentar com outro ficheiro</Btn>
                  <Btn onClick={()=>setParseError('')} variant="ghost" accent={pal.accent} style={{width:'100%'}}>Voltar</Btn>
                </div>
              )}
            </div>
          )}

          {/* PASSO 3: preview */}
          {step===3&&(
            <div>
              {/* Resumo */}
              <div style={{display:'flex',gap:8,marginBottom:14}}>
                <div style={{flex:1,background:pal.soft,borderRadius:10,padding:'10px 12px',textAlign:'center'}}>
                  <div style={{fontSize:11,color:T.textSec,marginBottom:2}}>A importar</div>
                  <div style={{fontSize:16,fontWeight:700,color:T.text}}>{toSave.length}/{parsed.length}</div>
                </div>
                <div style={{flex:1,background:'rgba(74,222,128,0.08)',borderRadius:10,padding:'10px 12px',textAlign:'center'}}>
                  <div style={{fontSize:11,color:T.textSec,marginBottom:2}}>Receitas</div>
                  <div style={{fontSize:14,fontWeight:700,color:T.green}}>{dec(totalRec)}</div>
                </div>
                <div style={{flex:1,background:'rgba(248,113,113,0.08)',borderRadius:10,padding:'10px 12px',textAlign:'center'}}>
                  <div style={{fontSize:11,color:T.textSec,marginBottom:2}}>Despesas</div>
                  <div style={{fontSize:14,fontWeight:700,color:T.red}}>{dec(totalDesp)}</div>
                </div>
              </div>

              {/* O que vai actualizar na conta */}
              {(meta.saldo_final!==null || (meta.iban&&!selAccObj?.iban) || (meta.numero_conta&&!selAccObj?.numero_conta))&&(
                <Card style={{background:pal.soft,padding:'11px 14px',marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:600,color:pal.accent,marginBottom:6}}>📋 Vai actualizar a conta</div>
                  {meta.saldo_final!==null&&<div style={{fontSize:12,color:T.textSec,marginBottom:2}}>Saldo → <span style={{color:T.text,fontWeight:600}}>{dec(meta.saldo_final)}</span></div>}
                  {meta.iban&&!selAccObj?.iban&&<div style={{fontSize:12,color:T.textSec,marginBottom:2}}>IBAN → <span style={{color:T.text,fontWeight:600}}>{meta.iban}</span></div>}
                  {meta.numero_conta&&!selAccObj?.numero_conta&&<div style={{fontSize:12,color:T.textSec}}>Nº conta → <span style={{color:T.text,fontWeight:600}}>{meta.numero_conta}</span></div>}
                </Card>
              )}

              {/* Lista de transações */}
              <div style={{fontSize:11,color:T.textTer,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>
                Transações encontradas · {fileName}
              </div>
              <Card style={{marginBottom:14}}>
                {parsed.map((t,i)=>(
                  <div key={t.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderBottom:i<parsed.length-1?`1px solid ${T.border}`:'none',opacity:t.keep?1:0.4,transition:'opacity 0.15s'}}>
                    <div onClick={()=>toggleKeep(t.id)} style={{flexShrink:0,cursor:'pointer'}}>
                      {t.keep?<CheckSquare size={18} color={pal.accent}/>:<Square size={18} color={T.textTer}/>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.descritivo}</div>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3}}>
                        <span style={{fontSize:10,color:T.textTer}}>{t.data}</span>
                        <select value={t.categoria} onChange={e=>setCat(t.id,e.target.value)} onClick={e=>e.stopPropagation()}
                          style={{fontSize:10,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:'1px 4px',color:T.textSec,outline:'none',cursor:'pointer'}}>
                          {CAT_LIST.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{fontSize:13,fontWeight:700,color:t.valor>=0?T.green:T.red,fontFamily:T.mono,whiteSpace:'nowrap',flexShrink:0}}>
                      {t.valor>=0?'+ ':'− '}{dec(t.valor)}
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div style={{flexShrink:0,padding:'12px 18px 20px',borderTop:`1px solid ${T.border}`}}>
          {step===1&&<Btn onClick={()=>selAccount&&setStep(2)} variant="primary" accent={pal.accent} style={{width:'100%'}} >Continuar →</Btn>}
          {step===3&&(
            <div style={{display:'flex',gap:10}}>
              <Btn onClick={()=>{setStep(2);setParseError('')}} variant="ghost" accent={pal.accent} style={{flex:1}}>← Repetir</Btn>
              <Btn onClick={confirmImport} variant="primary" accent={pal.accent} style={{flex:2}}>
                {saving?'A guardar…':`✓ Importar ${toSave.length} transações`}
              </Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────
// SCREENS
// ─────────────────────────────────────────────────────────────────
const BudgetScreen = ({accounts,transactions,tag,pal,title,onViewAll,onRefresh}:{accounts:Account[],transactions:Transaction[],tag:string,pal:{grad:string,accent:string,soft:string},title:string,onViewAll:()=>void,onRefresh:()=>void}) => {
  const [sel,setSel] = useState<string|null>(null)
  const [editTxn,setEditTxn] = useState<Transaction|null>(null)
  const tagAccs = accounts.filter(a=>a.budget_tag===tag)
  const view = computeView(accounts,transactions,tag,sel)
  const now = new Date()
  const period = `${MONTHS_FULL[now.getMonth()]} ${now.getFullYear()}`
  const selName = tagAccs.find(a=>a.id===sel)?.nome.split(' ').slice(-1)[0]
  return (
    <div>
      <Hero pal={pal} title={title} period={period} mainValue={big(view.saldo)} mainColor={view.saldo<0?'#FCA5A5':'#FFF'} trend={view.trend} kpis={[{l:'Receitas',v:dec(view.rec),c:'#4ADE80'},{l:'Despesas',v:dec(view.desp),c:'#F87171'},{l:'Saldo mês',v:sgn(view.net),c:view.net>=0?'#4ADE80':'#F87171'}]}/>
      <AccountList accounts={tagAccs} sel={sel} onSel={setSel} pal={pal}/>
      <div style={{marginBottom:20}}>
        <Lbl title={sel?`Despesas — ${selName}`:'Despesas'}/>
        <Card>{view.cats.length?view.cats.map((c,i,a)=><CatRow key={i} {...c} last={i===a.length-1}/>):<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem despesas este mês. Importa um extracto.</div>}</Card>
      </div>
      <TrendTile data={view.trend} accent={pal.accent}/>
      <div style={{marginBottom:20}}>
        <Lbl title="Últimas transações" action="Ver todas →" accent={pal.accent} onAction={onViewAll}/>
        <Card>{view.txns.length?view.txns.map((t,i)=><TxnRow key={t.id} t={t} last={i===view.txns.length-1} onClick={()=>setEditTxn(t)}/>):<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem transações. Importa o teu primeiro extracto.</div>}</Card>
      </div>
      {editTxn&&<TxnEditForm txn={editTxn} onClose={()=>setEditTxn(null)} onSaved={onRefresh} pal={pal}/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// IMÓVEL FORM (create + edit)
// ─────────────────────────────────────────────────────────────────
const emptyImovel = {nome:'',local:'',tipo:'apartamento',ownership_pct:'100',ativo:'sim',valorizacao:'0',valorizacao_data:''}
const ImovelForm = ({initial,accounts,linkedAccountIds,onClose,onSaved,pal,imoveisLen}:{initial:Imovel|null,accounts:Account[],linkedAccountIds:Set<string>,onClose:()=>void,onSaved:()=>void,pal:{accent:string,soft:string},imoveisLen:number}) => {
  const [form,setForm] = useState(initial ? {nome:initial.nome,local:initial.local??'',tipo:initial.tipo,ownership_pct:String(initial.ownership_pct),ativo:initial.ativo?'sim':'nao',valorizacao:String(initial.valorizacao||0),valorizacao_data:initial.valorizacao_data??''} : emptyImovel)
  const [links,setLinks] = useState<Set<string>>(new Set(linkedAccountIds))
  const [saving,setSaving] = useState(false)
  const isEdit = !!initial
  const investAccounts = accounts.filter(a=>a.budget_tag==='investimento')
  const f = (k:string)=>(v:string)=>setForm({...form,[k]:v})
  const toggleLink = (id:string) => { const n=new Set(links); n.has(id)?n.delete(id):n.add(id); setLinks(n) }

  const submit = async () => {
    if(!form.nome) return
    setSaving(true)
    const payload = {nome:form.nome,local:form.local||null,morada:null,tipo:form.tipo,renda_esperada:0,tem_hipoteca:false,hipoteca_valor:0,ativo:form.ativo==='sim',ordem:imoveisLen,ownership_pct:Number(form.ownership_pct),valorizacao:parseNum(form.valorizacao),valorizacao_data:form.valorizacao_data||null}
    let imovelId = initial?.id
    if(isEdit){ await updateImovel(initial!.id,payload) }
    else { const {data} = await saveImovel(payload as any); imovelId = data?.id }
    if(imovelId){
      for(const accId of investAccounts.map(a=>a.id)){
        const wasLinked = linkedAccountIds.has(accId)
        const nowLinked = links.has(accId)
        if(nowLinked && !wasLinked) await linkContaImovel(accId,imovelId)
        if(!nowLinked && wasLinked) await unlinkContaImovel(accId,imovelId)
      }
    }
    await onSaved(); setSaving(false); onClose()
  }

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:120,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:'20px 20px 0 0',width:'100%',maxWidth:440,maxHeight:'88vh',overflow:'auto',padding:'0 0 24px'}}>
        <div style={{display:'flex',alignItems:'center',padding:'16px 18px',borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,background:T.surface}}>
          <div style={{flex:1,fontSize:15,fontWeight:700,color:T.text}}>{isEdit?'Editar Imóvel':'Novo Imóvel'}</div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer'}}><X size={18} color={T.textSec}/></button>
        </div>
        <div style={{padding:'20px 18px'}}>
          <Inp label="Nome do imóvel" value={form.nome} onChange={f('nome')} placeholder="ex: Apt Marquês T2"/>
          <Inp label="Localização" value={form.local} onChange={f('local')} placeholder="ex: Lisboa"/>
          <Sel label="Tipo" value={form.tipo} onChange={f('tipo')} options={[{value:'apartamento',label:'Apartamento'},{value:'moradia',label:'Moradia'},{value:'garagem',label:'Garagem'},{value:'comercial',label:'Comercial'},{value:'outro',label:'Outro'}]}/>
          <Sel label="Estado" value={form.ativo} onChange={f('ativo')} options={[{value:'sim',label:'🟢 Arrendado'},{value:'nao',label:'⚪ Não arrendado'}]}/>
          <Inp label="% da tua propriedade" value={form.ownership_pct} onChange={f('ownership_pct')} type="number"/>
          <div style={{fontSize:11,color:T.textSec,marginTop:-8,marginBottom:14,lineHeight:1.5}}>Usada apenas na tab Património para calcular a tua quota. Na tab Imóveis os valores são sempre a 100%.</div>

          <div style={{fontSize:11,color:T.textTer,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:10,marginTop:4}}>Valorização (valor de mercado)</div>
          <MoneyInp label="Valor estimado (€)" value={form.valorizacao} onChange={f('valorizacao')} placeholder="ex: 250 000,00"/>
          <Inp label="Data da última actualização" value={form.valorizacao_data} onChange={f('valorizacao_data')} type="date"/>
          <div style={{fontSize:11,color:T.textSec,marginTop:-8,marginBottom:14,lineHeight:1.5}}>Informativo. Só entra nos totais quando ligas o toggle "Incluir valorização".</div>

          <div style={{fontSize:11,color:T.textTer,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:10,marginTop:4}}>Contas associadas</div>
          {investAccounts.length===0&&<div style={{fontSize:12,color:T.textSec,marginBottom:14,lineHeight:1.5}}>Não tens contas de investimento. Cria uma conta com budget "🔵 Investimento" nas Definições para associar a este imóvel.</div>}
          {investAccounts.map(a=>{
            const on = links.has(a.id)
            return (
              <div key={a.id} onClick={()=>toggleLink(a.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',background:T.surface2,borderRadius:10,marginBottom:8,cursor:'pointer',border:`1px solid ${on?pal.accent:T.border}`}}>
                <div style={{flexShrink:0}}>{on?<CheckSquare size={18} color={pal.accent}/>:<Square size={18} color={T.textTer}/>}</div>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.text}}>{a.nome}</div><div style={{fontSize:11,color:T.textSec}}>{a.banco}</div></div>
              </div>
            )
          })}

          <div style={{display:'flex',gap:10,marginTop:8}}>
            <Btn onClick={onClose} variant="ghost" accent={pal.accent} style={{flex:1}}>Cancelar</Btn>
            <Btn onClick={submit} variant="primary" accent={pal.accent} style={{flex:2}}>{saving?'A guardar…':(isEdit?'Guardar alterações':'Criar imóvel')}</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// ASSIGN QUEUE — transações por associar a imóvel
// ─────────────────────────────────────────────────────────────────
const AssignQueue = ({txns,imoveis,onClose,onRefresh,pal}:{txns:Transaction[],imoveis:Imovel[],onClose:()=>void,onRefresh:()=>void,pal:{accent:string,soft:string}}) => {
  const [busy,setBusy] = useState(false)
  const assign = async (txnId:string, imovelId:string|null) => {
    setBusy(true); await assignTransactionToImovel(txnId,imovelId); await onRefresh(); setBusy(false)
  }
  return (
    <div style={{position:'fixed',inset:0,background:T.bg,zIndex:95,overflowY:'auto',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'}}>
      <div style={{maxWidth:440,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:T.surface,borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,zIndex:10}}>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ArrowLeft size={18} color={T.textSec}/></button>
          <div style={{fontSize:16,fontWeight:700,color:T.text,flex:1}}>Por associar ({txns.length})</div>
        </div>
        <div style={{padding:'16px 14px'}}>
          <div style={{fontSize:13,color:T.textSec,marginBottom:16,lineHeight:1.5}}>Transações das tuas contas de investimento ainda sem imóvel. Associa cada uma ao imóvel certo, ou marca como "Geral" se não pertence a nenhum.</div>
          {txns.length===0&&<Card><div style={{padding:32,textAlign:'center',color:T.textSec,fontSize:13}}>✓ Tudo associado! Não há transações pendentes.</div></Card>}
          {txns.map(t=>(
            <Card key={t.id} style={{marginBottom:10,padding:'13px 14px'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <div style={{width:34,height:34,borderRadius:10,background:T.surface2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0}}>{getCatStyle(t.categoria??'Outros').icon}</div>
                <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.descritivo}</div><div style={{fontSize:11,color:T.textSec}}>{t.data}</div></div>
                <div style={{fontSize:14,fontWeight:700,color:t.valor>=0?T.green:T.red,fontFamily:T.mono}}>{t.valor>=0?'+ ':'− '}{dec(t.valor)}</div>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {imoveis.map(im=>(
                  <button key={im.id} disabled={busy} onClick={()=>assign(t.id,im.id)} style={{background:pal.soft,border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 11px',fontSize:12,fontWeight:600,color:pal.accent,cursor:'pointer'}}>{im.nome}</button>
                ))}
                <button disabled={busy} onClick={()=>assign(t.id,null)} style={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 11px',fontSize:12,fontWeight:600,color:T.textSec,cursor:'pointer'}}>Geral (nenhum)</button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// IMÓVEIS SCREEN — full management
// ─────────────────────────────────────────────────────────────────
const ImoveisScreen = ({imoveis,transactions,accounts,contaImovel,pal,onRefresh,onViewAll}:{imoveis:Imovel[],transactions:Transaction[],accounts:Account[],contaImovel:ContaImovel[],pal:{grad:string,accent:string,soft:string},onRefresh:()=>void,onViewAll:()=>void}) => {
  const [formOpen,setFormOpen] = useState(false)
  const [editing,setEditing] = useState<Imovel|null>(null)
  const [showQueue,setShowQueue] = useState(false)
  const [editTxn,setEditTxn] = useState<Transaction|null>(null)
  const [selAcc,setSelAcc] = useState<string|null>(null)
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`

  const investAccounts = accounts.filter(a=>a.budget_tag==='investimento')
  const investAccountIds = new Set(investAccounts.map(a=>a.id))

  // Renda/custos por imóvel (filtra por conta selecionada se houver)
  const matchAcc = (t:Transaction) => selAcc ? t.account_id===selAcc : true
  const getImRenda = (id:string) => transactions.filter(t=>t.imovel_id===id&&matchAcc(t)&&t.data.startsWith(ym)&&t.valor>0).reduce((s,t)=>s+t.valor,0)
  const getImCusto = (id:string) => transactions.filter(t=>t.imovel_id===id&&matchAcc(t)&&t.data.startsWith(ym)&&t.valor<0).reduce((s,t)=>s+Math.abs(t.valor),0)
  const linkedAccounts = (imovelId:string) => new Set(contaImovel.filter(ci=>ci.imovel_id===imovelId).map(ci=>ci.account_id))

  const totRenda=imoveis.reduce((s,im)=>s+getImRenda(im.id),0)
  const totCusto=imoveis.reduce((s,im)=>s+getImCusto(im.id),0)
  const totRes=totRenda-totCusto
  const ativos=imoveis.filter(im=>im.ativo).length

  // Valorização total (100%) e toggle
  const [showValoriz,setShowValoriz] = useState(false)
  const totValoriz = imoveis.reduce((s,im)=>s+(im.valorizacao||0),0)

  // KPIs do hero — 4º KPI muda conforme o toggle
  const imoveisKpis = [
    {l:'Rendas',v:dec(totRenda),c:'#4ADE80'},
    {l:'Custos',v:dec(totCusto),c:'#F87171'},
    {l:'Resultado',v:sgn(totRes),c:totRes>=0?'#4ADE80':'#F87171'},
    showValoriz
      ? {l:'Valorização',v:big(totValoriz),c:'#FFF'}
      : {l:'Arrendados',v:`${ativos}/${imoveis.length}`,c:'#FFF'},
  ]

  // Fila por associar
  const porAssociar = transactions.filter(t=>investAccountIds.has(t.account_id) && !t.imovel_classificado)

  // Transações recentes das contas de investimento (filtradas por conta selecionada)
  const recentTxns = transactions.filter(t=>investAccountIds.has(t.account_id) && matchAcc(t)).slice(0,8)

  const trend=Array.from({length:5},(_,i)=>{const offset=i-4;const d=new Date();d.setMonth(d.getMonth()+offset);const ym2=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;const mRec=transactions.filter(t=>t.imovel_id&&matchAcc(t)&&t.data.startsWith(ym2)&&t.valor>0).reduce((s,t)=>s+t.valor,0);const mDesp=transactions.filter(t=>t.imovel_id&&matchAcc(t)&&t.data.startsWith(ym2)&&t.valor<0).reduce((s,t)=>s+Math.abs(t.valor),0);return{m:getMonthLabel(offset),rec:mRec,desp:mDesp,net:mRec-mDesp}})

  const imovelNome = (id:string|null) => id ? (imoveis.find(im=>im.id===id)?.nome ?? 'Imóvel') : null

  return (
    <div>
      <Hero pal={pal} title="Conta Corrente Imóveis" period={`${MONTHS_FULL[now.getMonth()]} ${now.getFullYear()}`} mainValue={big(totRes)} mainSuffix="/mês" trend={trend} kpis={imoveisKpis}/>

      {/* Toggle valorização */}
      <div onClick={()=>setShowValoriz(v=>!v)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:showValoriz?pal.soft:T.surface,borderRadius:12,border:`1px solid ${showValoriz?pal.accent:T.border}`,marginBottom:16,cursor:'pointer',transition:'all 0.15s'}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:600,color:T.text}}>Incluir valorização dos imóveis</div>
          <div style={{fontSize:11,color:T.textSec,marginTop:1}}>{showValoriz?`Valor total: ${big(totRes+totValoriz)}`:'Mostra o valor de mercado somado ao resultado'}</div>
        </div>
        <div style={{width:44,height:26,borderRadius:13,background:showValoriz?pal.accent:T.surface3,position:'relative',transition:'background 0.15s',flexShrink:0}}>
          <div style={{width:20,height:20,borderRadius:'50%',background:'#FFF',position:'absolute',top:3,left:showValoriz?21:3,transition:'left 0.15s'}}/>
        </div>
      </div>

      {/* Card valor total quando toggle ON */}
      {showValoriz&&(
        <Card style={{marginBottom:16,padding:'14px 16px',background:pal.grad,border:'1px solid rgba(255,255,255,0.06)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600,marginBottom:3}}>Valor total (100%)</div>
              <div style={{fontSize:11,color:'rgba(255,255,255,0.5)'}}>Valorização + resultado do mês</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:24,fontWeight:700,color:'#FFF',fontFamily:T.mono}}>{big(totValoriz+totRes)}</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginTop:2}}>{big(totValoriz)} {totRes>=0?'+ ':'− '}{dec(Math.abs(totRes))}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Fila por associar */}
      {porAssociar.length>0&&(
        <Card style={{marginBottom:16,padding:'13px 16px',background:pal.soft,border:`1px solid ${pal.accent}`,cursor:'pointer'}}>
          <div onClick={()=>setShowQueue(true)} style={{display:'flex',alignItems:'center',gap:12}}>
            <Inbox size={20} color={pal.accent}/>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:T.text}}>{porAssociar.length} transações por associar</div><div style={{fontSize:11,color:T.textSec,marginTop:1}}>Toca para classificar por imóvel</div></div>
            <div style={{fontSize:12,color:pal.accent,fontWeight:600}}>Abrir →</div>
          </div>
        </Card>
      )}

      {/* ── POR IMÓVEL ── */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'0 2px'}}>
        <span style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase'}}>Por imóvel</span>
        <button onClick={()=>{setEditing(null);setFormOpen(true)}} style={{display:'flex',alignItems:'center',gap:4,background:pal.soft,border:'none',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}><Plus size={12} color={pal.accent}/><span style={{fontSize:11,color:pal.accent,fontWeight:600}}>Adicionar</span></button>
      </div>
      {imoveis.length===0&&<Card style={{marginBottom:20}}><div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem imóveis ainda. Toca em "Adicionar" para criar o primeiro.</div></Card>}
      {imoveis.map(im=>{
        const renda=getImRenda(im.id), custo=getImCusto(im.id), res=renda-custo, pos=res>=0
        const nLinks=contaImovel.filter(ci=>ci.imovel_id===im.id).length
        const temValoriz=(im.valorizacao||0)>0
        return (
          <div key={im.id} style={{background:pos?PROP_GRAD.pos:PROP_GRAD.neg,borderRadius:14,padding:'15px 16px',marginBottom:10,border:'1px solid rgba(255,255,255,0.06)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700,color:'#FFF'}}>{im.nome}</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.4)',marginTop:2}}>{im.local}{nLinks>0?` · ${nLinks} conta${nLinks>1?'s':''}`:' · sem conta'}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:19,fontWeight:700,color:pos?T.green:T.red,fontFamily:T.mono}}>{pos?'+ ':'− '}{dec(Math.abs(res))}</div>
                  <div style={{fontSize:9,color:'rgba(255,255,255,0.28)',marginTop:1}}>resultado/mês</div>
                </div>
                <button onClick={()=>{setEditing(im);setFormOpen(true)}} style={{background:'rgba(255,255,255,0.1)',border:'none',borderRadius:8,padding:6,cursor:'pointer'}}><Edit2 size={13} color="#FFF"/></button>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:(showValoriz&&temValoriz)?10:0}}>
              {[{l:'Renda',v:dec(renda),c:T.green},{l:'Custos',v:dec(custo),c:T.red},{l:'Estado',v:im.ativo?'Arrendado':'Não arrend.',c:im.ativo?T.green:'rgba(255,255,255,0.35)'}].map((k,i)=>(<div key={i} style={{background:'rgba(255,255,255,0.09)',borderRadius:8,padding:'8px 10px'}}><div style={{fontSize:9,color:'rgba(255,255,255,0.35)',textTransform:'uppercase',letterSpacing:'0.06em',fontWeight:600,marginBottom:2}}>{k.l}</div><div style={{fontSize:11,fontWeight:700,color:k.c,fontFamily:T.mono}}>{k.v}</div></div>))}
            </div>
            {/* Valorização informativa (só quando toggle ON e há valor definido) */}
            {showValoriz&&temValoriz&&(
              <div style={{background:'rgba(255,255,255,0.06)',borderRadius:8,padding:'9px 11px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div><div style={{fontSize:11,color:'rgba(255,255,255,0.6)',fontWeight:600}}>Valorização estimada</div>{im.valorizacao_data&&<div style={{fontSize:9,color:'rgba(255,255,255,0.3)',marginTop:1}}>actualizado {fmtDate(im.valorizacao_data)}</div>}</div>
                <div style={{fontSize:14,fontWeight:700,color:'#FFF',fontFamily:T.mono}}>{big(im.valorizacao)}</div>
              </div>
            )}
          </div>
        )
      })}

      {/* ── CONTAS ── */}
      <div style={{marginTop:20,marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'0 2px'}}>
          <span style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase'}}>Contas</span>
          {selAcc&&<button onClick={()=>setSelAcc(null)} style={{display:'flex',alignItems:'center',gap:4,background:pal.soft,border:'none',borderRadius:8,padding:'3px 8px',cursor:'pointer'}}><span style={{fontSize:11,color:pal.accent,fontWeight:600}}>Ver tudo</span><X size={11} color={pal.accent}/></button>}
        </div>
        {investAccounts.length===0&&<Card><div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem contas de investimento. Cria uma nas Definições com budget "🔵 Investimento".</div></Card>}
        {investAccounts.length>0&&(
          <Card>
            {investAccounts.map((c,i)=>{
              const active=selAcc===c.id, saldo=accountSaldo(c), isCard=c.tipo==='cartão'
              return (
                <div key={c.id} onClick={()=>setSelAcc(active?null:c.id)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',borderBottom:i<investAccounts.length-1?`1px solid ${T.border}`:'none',borderLeft:active?`3px solid ${pal.accent}`:'3px solid transparent',background:active?pal.soft:'transparent',cursor:'pointer',transition:'all 0.12s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>{isCard&&<CreditCard size={15} color={T.textSec}/>}<div><div style={{fontSize:13,fontWeight:active?700:500,color:active?pal.accent:T.text}}>{c.nome}</div><div style={{fontSize:11,color:T.textSec,marginTop:1}}>{c.titular} · {c.banco}</div></div></div>
                  <div style={{fontSize:15,fontWeight:700,color:saldo<0?T.red:(active?pal.accent:T.text),fontFamily:T.mono}}>{saldo<0?'− ':''}{dec(saldo)}</div>
                </div>
              )
            })}
          </Card>
        )}
      </div>

      {/* ── TRANSAÇÕES ── */}
      <div style={{marginBottom:20}}>
        <Lbl title={selAcc?`Transações — ${investAccounts.find(a=>a.id===selAcc)?.nome.split(' ').slice(-1)[0]}`:'Últimas transações'} action="Ver todas →" accent={pal.accent} onAction={onViewAll}/>
        <Card>
          {recentTxns.length===0&&<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem transações. Importa um extracto de uma conta de investimento.</div>}
          {recentTxns.map((t,i)=>{
            const imN = imovelNome(t.imovel_id)
            return (
              <div key={t.id} onClick={()=>setEditTxn(t)} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',borderBottom:i<recentTxns.length-1?`1px solid ${T.border}`:'none',cursor:'pointer'}}>
                <div style={{width:38,height:38,borderRadius:12,background:T.surface2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,flexShrink:0}}>{getCatStyle(t.categoria??'Outros').icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.descritivo}</div>
                  <div style={{fontSize:11,color:T.textSec,marginTop:2}}>{imN?`🏠 ${imN}`:(t.categoria??'Sem categoria')} · {t.data}</div>
                </div>
                <Edit2 size={13} color={T.textTer} style={{flexShrink:0}}/>
                <div style={{fontSize:13,fontWeight:700,color:t.valor>=0?T.green:T.red,fontFamily:T.mono,whiteSpace:'nowrap'}}>{t.valor>=0?'+ ':'− '}{dec(t.valor)}</div>
              </div>
            )
          })}
        </Card>
      </div>

      {formOpen&&<ImovelForm initial={editing} accounts={accounts} linkedAccountIds={editing?linkedAccounts(editing.id):new Set()} onClose={()=>setFormOpen(false)} onSaved={onRefresh} pal={pal} imoveisLen={imoveis.length}/>}
      {showQueue&&<AssignQueue txns={porAssociar} imoveis={imoveis} onClose={()=>setShowQueue(false)} onRefresh={onRefresh} pal={pal}/>}
      {editTxn&&<TxnEditForm txn={editTxn} onClose={()=>setEditTxn(null)} onSaved={onRefresh} pal={pal} imoveis={imoveis}/>}
    </div>
  )
}

const PatrimonioScreen = ({accounts,imoveis,pal}:{accounts:Account[],imoveis:Imovel[],pal:{grad:string,accent:string,soft:string}}) => {
  const [showValoriz,setShowValoriz] = useState(false)
  // Soma saldos por tag (respeita sinal do cartão de crédito)
  const sumTag = (tag:string) => accounts.filter(a=>a.budget_tag===tag).reduce((s,a)=>s+accountSaldo(a),0)
  // Quota = soma de (saldo × ownership_pct) por conta
  const quotaTag = (tag:string) => accounts.filter(a=>a.budget_tag===tag).reduce((s,a)=>s+accountSaldo(a)*(a.ownership_pct/100),0)

  const pesSaldo=sumTag('pessoal'), famSaldo=sumTag('familiar'), invSaldo=sumTag('investimento')
  const pesQuota=quotaTag('pessoal'), famQuota=quotaTag('familiar'), invQuota=quotaTag('investimento')

  // Valorização dos imóveis: bruto (100%) e quota (× ownership de cada imóvel)
  const valorizBruto = imoveis.reduce((s,im)=>s+(im.valorizacao||0),0)
  const valorizQuota = imoveis.reduce((s,im)=>s+(im.valorizacao||0)*(im.ownership_pct/100),0)

  const baseItems=[
    {nome:'Contas Pessoais',    valor:pesSaldo, meu:pesQuota, cor:PAL.pessoal.accent},
    {nome:'Contas Familiares',  valor:famSaldo, meu:famQuota, cor:PAL.familiar.accent},
    {nome:'Contas Imóveis',     valor:invSaldo, meu:invQuota, cor:PAL.imoveis.accent},
  ]
  const valorizItem = {nome:'Valorização Imóveis', valor:valorizBruto, meu:valorizQuota, cor:'#A78BFA'}
  const items=[...baseItems,...(showValoriz?[valorizItem]:[])].filter(it=>it.valor!==0)

  const totalBruto=pesSaldo+famSaldo+invSaldo+(showValoriz?valorizBruto:0)
  const minhaQuota=pesQuota+famQuota+invQuota+(showValoriz?valorizQuota:0)
  const trend=Array.from({length:5},(_,i)=>({m:getMonthLabel(i-4),rec:totalBruto*(0.9+i*.025),desp:0,net:totalBruto*(0.9+i*.025)}))
  const now=new Date()
  return (
    <div>
      <Hero pal={pal} title="Património — Saldos" period={`${MONTHS_FULL[now.getMonth()]} ${now.getFullYear()}`} mainValue={big(minhaQuota)} mainColor={minhaQuota<0?'#FCA5A5':'#FFF'} trend={trend} kpis={[{l:'Total bruto',v:big(totalBruto),c:'rgba(255,255,255,0.45)'},{l:'A tua quota',v:big(minhaQuota),c:'#FFF'},{l:'Contas',v:String(accounts.length),c:'rgba(255,255,255,0.7)'}]}/>

      {/* Toggle valorização */}
      {valorizBruto>0&&(
        <div onClick={()=>setShowValoriz(v=>!v)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:showValoriz?pal.soft:T.surface,borderRadius:12,border:`1px solid ${showValoriz?pal.accent:T.border}`,marginBottom:16,cursor:'pointer',transition:'all 0.15s'}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:T.text}}>Incluir valorização dos imóveis</div>
            <div style={{fontSize:11,color:T.textSec,marginTop:1}}>{showValoriz?`+ ${big(valorizQuota)} (tua quota)`:'Soma o valor de mercado ao património'}</div>
          </div>
          <div style={{width:44,height:26,borderRadius:13,background:showValoriz?pal.accent:T.surface3,position:'relative',transition:'background 0.15s',flexShrink:0}}>
            <div style={{width:20,height:20,borderRadius:'50%',background:'#FFF',position:'absolute',top:3,left:showValoriz?21:3,transition:'left 0.15s'}}/>
          </div>
        </div>
      )}

      <Lbl title="Composição"/>
      {items.map((item,i)=>{
        const pct = item.valor!==0 ? Math.round(item.meu/item.valor*100) : 100
        return (<Card key={i} style={{marginBottom:10,padding:'13px 16px'}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}><div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:10,height:10,borderRadius:'50%',background:item.cor,flexShrink:0}}/><div><div style={{fontSize:13,fontWeight:600,color:T.text}}>{item.nome}</div><div style={{fontSize:11,color:T.textSec}}>Quota: {pct}%</div></div></div><div style={{textAlign:'right'}}><div style={{fontSize:15,fontWeight:700,color:item.meu<0?T.red:T.text,fontFamily:T.mono}}>{item.meu<0?'− ':''}{dec(item.meu)}</div><div style={{fontSize:11,color:T.textSec}}>de {dec(item.valor)}</div></div></div><div style={{height:4,borderRadius:3,background:T.border}}><div style={{width:`${totalBruto?Math.abs(item.meu)/Math.abs(totalBruto)*100:0}%`,height:'100%',borderRadius:3,background:item.cor}}/></div></Card>)
      })}
      {items.length===0&&<Card><div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem contas com saldo. Adiciona contas nas Definições.</div></Card>}
      <Card style={{background:pal.soft,padding:'12px 16px'}}><div style={{fontSize:12,fontWeight:600,color:pal.accent,marginBottom:4}}>ℹ️ Como é calculado</div><div style={{fontSize:12,color:T.textSec,lineHeight:1.6}}>Saldos de todas as contas (pessoais, familiares e imóveis). A tua quota usa a % de propriedade de cada conta. Com o toggle ligado, soma a valorização dos imóveis × a tua % de cada imóvel. Cartões de crédito entram como dívida.</div></Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────
const TABS = [
  {id:'familiar',  label:'Familiar',   Icon:Home},
  {id:'pessoal',   label:'Pessoal',    Icon:User},
  {id:'imoveis',   label:'Imóveis',    Icon:Building2},
  {id:'patrimonio',label:'Património', Icon:TrendingUp},
]

export default function Page() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allTxns, setAllTxns] = useState<Transaction[]>([])
  const [imoveis, setImoveis] = useState<Imovel[]>([])
  const [rendas, setRendas] = useState<ImovelRenda[]>([])
  const [contaImovel, setContaImovel] = useState<ContaImovel[]>([])
  const [tab, setTab] = useState('familiar')
  const [showImport, setShowImport] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAllTxns, setShowAllTxns] = useState(false)
  const [toast, setToast] = useState<string|null>(null)

  const showToast = useCallback((msg:string)=>{setToast(msg);setTimeout(()=>setToast(null),2500)},[])
  const load = useCallback(async()=>{
    const data = await loadAllData()
    setAccounts(data.accounts); setTransactions(data.transactions)
    setImoveis(data.imoveis); setRendas(data.rendas); setContaImovel(data.contaImovel); setLoading(false)
  },[])
  const loadFull = useCallback(async()=>{ const all = await loadAllTransactions(); setAllTxns(all) },[])
  const refreshAll = useCallback(async()=>{ await load(); await loadFull() },[load,loadFull])

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{ setSession(session); if(session){load();loadFull()} else setLoading(false) })
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_,session)=>{ setSession(session); if(session){load();loadFull()} else {setLoading(false);setSession(null)} })
    return ()=>subscription.unsubscribe()
  },[load,loadFull])

  const pal = PAL[tab]

  if(loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:T.bg,fontFamily:'system-ui'}}>
      <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:800,color:T.text,marginBottom:8}}>Finance<span style={{color:PAL.familiar.accent}}>.</span></div><div style={{fontSize:13,color:T.textSec}}>A carregar…</div></div>
    </div>
  )
  if(!session) return <LoginScreen onLogin={()=>{setLoading(true);load();loadFull()}}/>

  const screens:Record<string,React.ReactNode> = {
    familiar:   <BudgetScreen accounts={accounts} transactions={transactions} tag="familiar" pal={PAL.familiar} title="Conta Corrente Familiar" onViewAll={()=>setShowAllTxns(true)} onRefresh={async()=>{await refreshAll();showToast('✓ Transação actualizada')}}/>,
    pessoal:    <BudgetScreen accounts={accounts} transactions={transactions} tag="pessoal"  pal={PAL.pessoal}  title="Conta Corrente Pessoal" onViewAll={()=>setShowAllTxns(true)} onRefresh={async()=>{await refreshAll();showToast('✓ Transação actualizada')}}/>,
    imoveis:    <ImoveisScreen imoveis={imoveis} transactions={transactions} accounts={accounts} contaImovel={contaImovel} pal={PAL.imoveis} onRefresh={async()=>{await refreshAll();showToast('✓ Imóveis actualizados')}} onViewAll={()=>setShowAllTxns(true)}/>,
    patrimonio: <PatrimonioScreen accounts={accounts} imoveis={imoveis} pal={PAL.patrimonio}/>,
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',maxWidth:440,margin:'0 auto',background:T.bg,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",sans-serif',color:T.text}}>
      <div style={{flexShrink:0,background:T.surface,borderBottom:`1px solid ${T.border}`,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{fontSize:20,fontWeight:800,letterSpacing:'-0.03em'}}>Finance<span style={{color:pal.accent}}>.</span></div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setShowImport(true)} style={{background:pal.soft,border:'none',borderRadius:10,padding:'7px 12px',display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}><Upload size={13} color={pal.accent}/><span style={{fontSize:12,fontWeight:600,color:pal.accent}}>Importar</span></button>
          <button onClick={()=>setShowSettings(true)} style={{background:T.surface2,border:'none',borderRadius:10,padding:'7px 10px',cursor:'pointer'}}><Settings size={14} color={T.textSec}/></button>
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'14px 12px 0'}}>{screens[tab]}<div style={{height:16}}/></div>
      <div style={{flexShrink:0,background:T.surface,borderTop:`1px solid ${T.border}`,display:'flex',padding:'8px 0 14px'}}>
        {TABS.map(({id,label,Icon})=>{const active=tab===id,c=active?PAL[id].accent:T.textTer;return (<button key={id} onClick={()=>setTab(id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3,background:'none',border:'none',cursor:'pointer',padding:'4px 0'}}><Icon size={20} color={c} strokeWidth={active?2.5:1.5}/><span style={{fontSize:10,fontWeight:active?700:400,color:c}}>{label}</span>{active&&<div style={{width:4,height:4,borderRadius:'50%',background:c}}/>}</button>)})}
      </div>
      {showImport&&<ImportWizard onClose={()=>setShowImport(false)} accounts={accounts} pal={pal} onDone={async()=>{await refreshAll();showToast('✓ Importação concluída')}}/>}
      {showSettings&&<SettingsPanel onClose={()=>setShowSettings(false)} accounts={accounts} onRefresh={async()=>{await refreshAll();showToast('✓ Dados actualizados')}} pal={pal}/>}
      {showAllTxns&&<AllTransactionsScreen allTxns={allTxns} accounts={accounts} tag={tab==='imoveis'?'investimento':tab} pal={pal} onClose={()=>setShowAllTxns(false)} onRefresh={async()=>{await refreshAll();showToast('✓ Transações actualizadas')}} imoveis={tab==='imoveis'?imoveis:undefined}/>}
      {toast&&<div style={{position:'fixed',bottom:90,left:'50%',transform:'translateX(-50%)',background:T.surface,border:`1px solid ${pal.accent}`,borderRadius:12,padding:'10px 16px',display:'flex',alignItems:'center',gap:8,zIndex:200,boxShadow:'0 8px 24px rgba(0,0,0,0.4)',whiteSpace:'nowrap'}}><Check size={15} color={pal.accent}/><span style={{fontSize:13,fontWeight:600,color:T.text}}>{toast}</span></div>}
    </div>
  )
}

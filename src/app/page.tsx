'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  ComposedChart, BarChart, LineChart, AreaChart,
  Bar, Line, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine,
} from 'recharts'
import {
  Home, User, Building2, TrendingUp, Upload, Settings, X, Plus, Check,
  ArrowLeft, Trash2, FileText, HardDrive, Zap, RefreshCw, Edit2, CreditCard,
  Filter, CheckSquare, Square, Tag, Calendar, SlidersHorizontal, Link2, Inbox,
  Sparkles, Target, BrainCircuit, Folder, ChevronRight, AlertTriangle, Bell,
  Users, UserPlus, Mail,
} from 'lucide-react'
import {
  supabase, loadAllData, loadAllTransactions, saveAccount, deleteAccount, updateAccount,
  saveTransactions, updateTransaction, deleteTransaction, deleteTransactions, recategorizeTransactions,
  saveImovel, updateImovel, deleteImovel, linkContaImovel, unlinkContaImovel,
  assignTransactionToImovel, assignTransactionsToImovel,
  loadCategoryRules, learnFromCategorization, matchRule, deleteCategoryRule, deleteCategoryRules, updateCategoryRule,
  getDriveConnectionStatus, disconnectDrive, getDriveAuthUrl, updateAccountDriveFolder, loadDriveFiles,
  listDriveFolderFiles, importDriveFile, resetDriveFileImport, previewDriveFile,
  loadNotifications, countUnreadNotifications, markNotificationsRead, deleteNotification,
  syncT212, getT212Status, loadT212Config, saveT212Config,
  getEnableBankingStatus, startEnableBankingConnect, syncEnableBanking, linkEnableBankingAccount, unlinkEnableBankingAccount,
  getCurrentProfile, updateMyProfile, loadAccountMembers, updateMemberOwnership, removeMember,
  findUserByEmail, inviteUserToAccount, loadPendingInvites, acceptInvite, rejectInvite,
  loadAccountPendingInvites, cancelInvite,
  type Account, type Transaction, type Imovel, type ContaImovel, type CategoryRule,
  type DriveToken, type DriveFile, type AppNotification, type T212Config,
  type Profile, type AccountMember, type AccountInvite,
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
const CAT_LIST = ['Receita','Groceries','Restauração','Compras','Saúde','Transportes','Lazer','Levantamentos','Habitação','Utilities','Subscrições','Investimentos','Comissões e Taxas','Transferências','Despesas Gerais']
const CAT_META: Record<string,{cor:string,icon:string}> = {
  'Receita':{cor:'#4ADE80',icon:'💰'},
  'Groceries':{cor:'#4ADE80',icon:'🛒'},
  'Restauração':{cor:'#F97316',icon:'🍽️'},
  'Compras':{cor:'#FB923C',icon:'🛍️'},
  'Saúde':{cor:'#38BDF8',icon:'🏥'},
  'Transportes':{cor:'#22D3EE',icon:'🚗'},
  'Lazer':{cor:'#FBBF24',icon:'🎭'},
  'Levantamentos':{cor:'#A3A3A3',icon:'💵'},
  'Habitação':{cor:'#A78BFA',icon:'🏠'},
  'Utilities':{cor:'#818CF8',icon:'💡'},
  'Subscrições':{cor:'#FB7185',icon:'📱'},
  'Investimentos':{cor:'#60A5FA',icon:'📈'},
  'Comissões e Taxas':{cor:'#94A3B8',icon:'🏦'},
  'Transferências':{cor:'#94A3B8',icon:'🔄'},
  'Despesas Gerais':{cor:'#64748B',icon:'📦'},
}
const getCatStyle = (nome:string) => CAT_META[nome] ?? CAT_META['Despesas Gerais']
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
// Formato curto para eixo de gráfico: 600, 1 200, ou 1,2k (≥1000 com 1 casa se não for redondo)
const compact = (n:number) => {
  const a = Math.abs(n)
  if(a < 1000) return Math.round(a).toString()
  const k = a/1000
  const rounded = Math.round(k*10)/10
  const str = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1).replace('.',',')
  return str+'k'
}
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
function getMonthLabel(offset:number, anchorYM?:string) {
  let d:Date
  if(anchorYM){ const [y,m]=anchorYM.split('-').map(Number); d=new Date(y,m-1,1) }
  else d = new Date()
  d.setMonth(d.getMonth()+offset)
  return MONTHS_SHORT[d.getMonth()]
}
function accountSaldo(a:Account) {
  return a.tipo === 'cartão' ? -Math.abs(a.saldo_atual) : a.saldo_atual
}
// Mês (YYYY-MM) mais recente entre as transações dadas; null se não houver nenhuma
function latestMonthWithData(txns:Transaction[]):string|null {
  if(!txns.length) return null
  const dates = txns.map(t=>t.data).filter(Boolean).sort()
  return dates[dates.length-1].slice(0,7) // YYYY-MM
}
// Label "Mês AAAA" por extenso a partir de um YYYY-MM (ou mês civil actual se null)
function monthYearLabel(ym:string|null):string {
  const now = new Date()
  if(!ym) return `${MONTHS_FULL[now.getMonth()]} ${now.getFullYear()}`
  const [y,m] = ym.split('-').map(Number)
  return `${MONTHS_FULL[m-1]} ${y}`
}

function computeView(accounts:Account[], transactions:Transaction[], tag:string, selId:string|null, monthOffset=0) {
  const accs = accounts.filter(a=>a.budget_tag===tag && (selId?a.id===selId:true))
  if (!accs.length) return {saldo:0,rec:0,desp:0,net:0,cats:[],trend:[],txns:[],refMonth:null as string|null}
  const ids = new Set(accs.map(a=>a.id))
  const txns = transactions.filter(t=>ids.has(t.account_id))
  const saldo = accs.reduce((s,a)=>s+accountSaldo(a),0)

  // Mês de referência = mês mais recente com transações, ajustado pelo offset de navegação
  const latestMonth = latestMonthWithData(txns)
  let refMonth: string|null = latestMonth
  if (latestMonth && monthOffset !== 0) {
    const [ry,rm] = latestMonth.split('-').map(Number)
    const d = new Date(ry,rm-1,1); d.setMonth(d.getMonth()+monthOffset)
    refMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  }
  const monthTxns = refMonth ? txns.filter(t=>t.data.startsWith(refMonth)) : []

  const rec = monthTxns.filter(t=>t.valor>0).reduce((s,t)=>s+t.valor,0)
  const desp = monthTxns.filter(t=>t.valor<0).reduce((s,t)=>s+Math.abs(t.valor),0)
  const catMap:Record<string,number> = {}
  monthTxns.filter(t=>t.valor<0&&t.categoria).forEach(t=>{ catMap[t.categoria!]=(catMap[t.categoria!]||0)+Math.abs(t.valor) })
  const totalDesp = Object.values(catMap).reduce((s,v)=>s+v,0)||1
  const cats = Object.entries(catMap).map(([nome,v])=>({nome,v,pct:Math.round(v/totalDesp*100),...getCatStyle(nome)})).sort((a,b)=>b.v-a.v)

  // Sparkline: 5 meses terminando no mês de referência
  const trend = refMonth ? Array.from({length:5},(_,i)=>{
    const offset=i-4
    const [ry,rm] = refMonth!.split('-').map(Number)
    const d = new Date(ry,rm-1,1); d.setMonth(d.getMonth()+offset)
    const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const mt=txns.filter(t=>t.data.startsWith(ym))
    const mRec=mt.filter(t=>t.valor>0).reduce((s,t)=>s+t.valor,0)
    const mDesp=mt.filter(t=>t.valor<0).reduce((s,t)=>s+Math.abs(t.valor),0)
    return {m:getMonthLabel(offset,refMonth!),rec:mRec,desp:mDesp,net:+(mRec-mDesp).toFixed(2)}
  }) : []

  // Últimas transações do mês seleccionado (8 mais recentes)
  const recentTxns = monthTxns.slice(0,8)

  return {saldo,rec,desp,net:+(rec-desp).toFixed(2),cats,trend,txns:recentTxns,refMonth,latestMonth}
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
// Campo de data: mostra/edita sempre em DD/MM/AAAA (independente do idioma do browser),
// mas guarda e devolve sempre ISO YYYY-MM-DD (o que a base de dados espera).
const isoToDisplay = (iso:string) => {
  if(!iso) return ''
  const [y,m,d] = iso.split('-')
  if(!y||!m||!d) return ''
  return `${d}/${m}/${y}`
}
const displayToIso = (disp:string) => {
  const digits = disp.replace(/\D/g,'')
  if(digits.length<8) return ''
  const d = digits.slice(0,2), m = digits.slice(2,4), y = digits.slice(4,8)
  return `${y}-${m}-${d}`
}
const maskDateInput = (raw:string) => {
  const digits = raw.replace(/\D/g,'').slice(0,8)
  let out = digits
  if(digits.length>=5) out = `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`
  else if(digits.length>=3) out = `${digits.slice(0,2)}/${digits.slice(2)}`
  return out
}
const DateInp = ({label,value,onChange}:{label:string,value:string,onChange:(iso:string)=>void}) => {
  const [display,setDisplay] = useState(isoToDisplay(value))
  useEffect(()=>{ setDisplay(isoToDisplay(value)) },[value])
  return (
    <div style={{marginBottom:14}}>
      <div style={{fontSize:11,color:T.textSec,fontWeight:600,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>{label}</div>
      <input inputMode="numeric" value={display} placeholder="DD/MM/AAAA"
        onChange={e=>{
          const masked = maskDateInput(e.target.value)
          setDisplay(masked)
          const iso = displayToIso(masked)
          if(iso) onChange(iso)
          else if(!masked) onChange('')
        }}
        style={{width:'100%',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px',color:T.text,fontSize:13,outline:'none',boxSizing:'border-box',fontFamily:T.mono}}/>
    </div>
  )
}
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
const Spark = ({trend, mode='budget'}:{trend:{m:string,rec:number,desp:number,net:number}[], mode?:'budget'|'patrimonio'}) => {
  const maxVal = Math.max(...trend.map(d=>mode==='patrimonio'?Math.abs(d.net):Math.max(d.rec,d.desp)), 0)
  const hasData = mode==='patrimonio' ? trend.some(d=>d.net!==0) : maxVal>0
  const midVal = maxVal/2

  if(mode==='patrimonio'){
    const netVals = trend.map(d=>d.net)
    const netMin = Math.min(...netVals)
    const netMax = Math.max(...netVals)
    const padding = Math.max((netMax-netMin)*0.15, netMax*0.05, 1)
    const domMin = netMin - padding
    const domMax = netMax + padding
    const midY = (domMin+domMax)/2
    return (
      <>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <span style={{fontSize:9,color:'rgba(255,255,255,0.28)',textTransform:'uppercase',letterSpacing:'0.07em',fontWeight:600}}>Tendência — 5 meses</span>
          <Leg c="rgba(255,255,255,0.7)" l="Património" line/>
        </div>
        {!hasData?(
          <div style={{height:64,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <span style={{fontSize:11,color:'rgba(255,255,255,0.25)'}}>Sem dados neste período</span>
          </div>
        ):(
          <div style={{position:'relative',height:64}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{top:4,right:28,bottom:0,left:0}}>
                <YAxis hide domain={[domMin,domMax]}/>
                <XAxis dataKey="m" tick={{fontSize:9,fill:'rgba(255,255,255,0.2)'}} axisLine={false} tickLine={false} interval={0} height={14} padding={{left:12,right:0}}/>
                <ReferenceLine y={midY} stroke="rgba(255,255,255,0.15)" strokeWidth={1} ifOverflow="visible"/>
                <ReferenceLine y={domMax} stroke="rgba(255,255,255,0.15)" strokeWidth={1} ifOverflow="visible"/>
                <Tooltip contentStyle={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,fontSize:11,padding:'6px 10px'}} itemStyle={{padding:0}} formatter={(v:any)=>[dec(v),'Património']} labelStyle={{color:T.text,fontWeight:600,fontSize:11,marginBottom:2}} cursor={{stroke:'rgba(255,255,255,0.15)',strokeWidth:1}}/>
                <Line dataKey="net" stroke="rgba(255,255,255,0.75)" strokeWidth={1.75} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
            <div style={{position:'absolute',top:4,right:0,fontSize:8,color:'rgba(255,255,255,0.3)'}}>{compact(domMax)}</div>
            <div style={{position:'absolute',top:'50%',right:0,transform:'translateY(-50%)',fontSize:8,color:'rgba(255,255,255,0.3)'}}>{compact(midY)}</div>
          </div>
        )}
      </>
    )
  }

  // modo budget
  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <span style={{fontSize:9,color:'rgba(255,255,255,0.28)',textTransform:'uppercase',letterSpacing:'0.07em',fontWeight:600}}>Tendência — 5 meses</span>
        <div style={{display:'flex',gap:10}}><Leg c={T.green} l="Rec" line/><Leg c={T.red} l="Desp" line/><Leg c="rgba(255,255,255,0.4)" l="Saldo"/></div>
      </div>
      {!hasData?(
        <div style={{height:50,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span style={{fontSize:11,color:'rgba(255,255,255,0.25)'}}>Sem dados neste período</span>
        </div>
      ):(
        <div style={{position:'relative',height:50}}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend} margin={{top:4,right:28,bottom:0,left:0}}>
              <YAxis hide domain={[0,maxVal*1.05]}/>
              <XAxis dataKey="m" hide/>
              <ReferenceLine y={midVal} stroke="rgba(255,255,255,0.15)" strokeWidth={1} ifOverflow="visible"/>
              <ReferenceLine y={maxVal} stroke="rgba(255,255,255,0.15)" strokeWidth={1} ifOverflow="visible"/>
              <Tooltip contentStyle={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,fontSize:11,padding:'6px 10px'}} itemStyle={{padding:0}} formatter={(v:any,k:string)=>{if(k==='net') return [<span style={{color:Number(v)>=0?T.green:T.red,fontWeight:600}}>{dec(v)}</span>,'Saldo']; return [dec(v),k==='rec'?'Receitas':'Despesas']}} labelStyle={{color:T.text,fontWeight:600,fontSize:11,marginBottom:2}} cursor={{fill:'rgba(255,255,255,0.04)'}}/>
              <Bar dataKey="net" fill="rgba(255,255,255,0.18)" radius={[2,2,0,0]} maxBarSize={16}/>
              <Line dataKey="rec" stroke={T.green} strokeWidth={1.75} dot={false}/>
              <Line dataKey="desp" stroke={T.red} strokeWidth={1.75} dot={false}/>
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{position:'absolute',top:4,right:0,fontSize:8,color:'rgba(255,255,255,0.3)'}}>{compact(maxVal)}</div>
          <div style={{position:'absolute',top:'50%',right:0,transform:'translateY(-50%)',fontSize:8,color:'rgba(255,255,255,0.3)'}}>{compact(midVal)}</div>
        </div>
      )}
      <div style={{display:'flex',justifyContent:'space-between',marginTop:4,paddingRight:28}}>
        {trend.map((d,i)=><span key={i} style={{fontSize:9,color:'rgba(255,255,255,0.2)',flex:1,textAlign:'center'}}>{d.m}</span>)}
      </div>
    </>
  )
}
const Toggle = ({val,set,accent}:{val:string,set:(v:string)=>void,accent:string}) => (
  <div style={{display:'flex',background:T.surface2,borderRadius:8,padding:2,gap:1}}>
    {['Bar','Linha','Área'].map(t=>(<button key={t} onClick={()=>set(t)} style={{padding:'3px 9px',borderRadius:6,border:'none',cursor:'pointer',background:val===t?accent:'transparent',color:val===t?'#0B0B12':T.textSec,fontSize:10,fontWeight:val===t?700:400,transition:'all 0.12s'}}>{t}</button>))}
  </div>
)
const DynChart = ({data,type}:{data:{m:string,rec:number,desp:number}[],type:string}) => {
  const tip = <Tooltip contentStyle={{background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,fontSize:12}} formatter={(v:any,k:string)=>[dec(v),k==='rec'?'Receitas':'Despesas']} labelStyle={{color:T.text,fontWeight:600}} cursor={{fill:'rgba(255,255,255,0.03)'}}/>
  const ax = <XAxis dataKey="m" tick={{fontSize:10,fill:T.textSec}} axisLine={false} tickLine={false} interval={0} padding={{left:8,right:8}}/>
  const margin = {top:8,right:6,bottom:0,left:10}
  const maxVal = Math.max(...data.map(d=>Math.max(d.rec,d.desp)), 0)
  const hasData = maxVal>0
  const midVal = maxVal/2
  const yAxis = <YAxis orientation="right" axisLine={false} tickLine={false} domain={[0,maxVal*1.05]} ticks={[midVal,maxVal]} tickFormatter={(v:number)=>compact(v)} tick={{fontSize:10,fill:T.textTer}} width={32}/>
  if(!hasData) return (
    <div style={{height:120,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <span style={{fontSize:12,color:T.textTer}}>Sem dados para mostrar</span>
    </div>
  )
  return (
    <ResponsiveContainer width="100%" height={120}>
      {type==='Bar'?(
        <BarChart data={data} barCategoryGap="25%" barGap={3} margin={margin}>
          {ax}{yAxis}{tip}
          <ReferenceLine y={midVal} stroke="rgba(255,255,255,0.15)" strokeWidth={1} ifOverflow="visible"/>
          <ReferenceLine y={maxVal} stroke="rgba(255,255,255,0.15)" strokeWidth={1} ifOverflow="visible"/>
          <Bar dataKey="rec" fill="rgba(74,222,128,0.4)" radius={[4,4,0,0]} maxBarSize={26}/>
          <Bar dataKey="desp" fill="rgba(248,113,113,0.4)" radius={[4,4,0,0]} maxBarSize={26}/>
        </BarChart>
      ):type==='Linha'?(
        <LineChart data={data} margin={margin}>
          {ax}{yAxis}{tip}
          <ReferenceLine y={midVal} stroke="rgba(255,255,255,0.15)" strokeWidth={1} ifOverflow="visible"/>
          <ReferenceLine y={maxVal} stroke="rgba(255,255,255,0.15)" strokeWidth={1} ifOverflow="visible"/>
          <Line dataKey="rec" stroke={T.green} strokeWidth={2} dot={false}/>
          <Line dataKey="desp" stroke={T.red} strokeWidth={2} dot={false}/>
        </LineChart>
      ):(
        <AreaChart data={data} margin={margin}>
          {ax}{yAxis}{tip}
          <ReferenceLine y={midVal} stroke="rgba(255,255,255,0.15)" strokeWidth={1} ifOverflow="visible"/>
          <ReferenceLine y={maxVal} stroke="rgba(255,255,255,0.15)" strokeWidth={1} ifOverflow="visible"/>
          <Area dataKey="rec" stroke={T.green} strokeWidth={2} fill="rgba(74,222,128,0.12)"/>
          <Area dataKey="desp" stroke={T.red} strokeWidth={2} fill="rgba(248,113,113,0.12)"/>
        </AreaChart>
      )}
    </ResponsiveContainer>
  )
}
const TrendTile = ({data,accent,catFilter}:{data:{m:string,rec:number,desp:number}[],accent:string,catFilter?:string|null}) => {
  const [type,setType] = useState('Linha')
  return (
    <div style={{marginBottom:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'0 2px',gap:8}}>
        <span style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase',whiteSpace:'nowrap'}}>{catFilter?`Evolução — ${catFilter}`:'Evolução mensal'}</span>
        <Toggle val={type} set={setType} accent={accent}/>
      </div>
      <Card style={{padding:'14px 14px 8px'}}><DynChart data={data} type={type}/></Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────────
const Hero = ({pal,title,mainValue,mainColor,kpis,trend,period,mainSuffix,sparkMode,onPrev,onNext,canNext}:{pal:{grad:string,accent:string,soft:string},title:string,mainValue:string,mainColor?:string,kpis:{l:string,v:string,c:string}[],trend:{m:string,rec:number,desp:number,net:number}[],period:string,mainSuffix?:string,sparkMode?:'budget'|'patrimonio',onPrev?:()=>void,onNext?:()=>void,canNext?:boolean}) => (
  <div style={{background:pal.grad,borderRadius:18,padding:'20px 18px 16px',marginBottom:16,border:'1px solid rgba(255,255,255,0.05)'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
      <div>
        <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600,marginBottom:5}}>{title}</div>
        <div style={{display:'flex',alignItems:'baseline',gap:6}}>
          <div style={{fontSize:32,fontWeight:700,color:mainColor??'#FFF',letterSpacing:'-0.03em',fontFamily:T.mono}}>{mainValue}</div>
          {mainSuffix&&<span style={{fontSize:12,color:'rgba(255,255,255,0.3)'}}>{mainSuffix}</span>}
        </div>
      </div>
      {/* Período sempre alinhado ao topo com altura fixa igual ao título — com ou sem setas */}
      <div style={{display:'flex',alignItems:'center',gap:4,height:16,marginTop:1}}>
        {onPrev&&<button onClick={onPrev} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.5)',fontSize:18,lineHeight:1,padding:'0 2px'}}>‹</button>}
        <span style={{fontSize:11,color:'rgba(255,255,255,0.45)',fontWeight:600,minWidth:52,textAlign:'center'}}>{period}</span>
        {onNext&&<button onClick={onNext} disabled={!canNext} style={{background:'none',border:'none',cursor:canNext?'pointer':'default',color:canNext?'rgba(255,255,255,0.5)':'rgba(255,255,255,0.15)',fontSize:18,lineHeight:1,padding:'0 2px'}}>›</button>}
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:`repeat(${kpis.length},1fr)`,gap:6,marginBottom:14}}>
      {kpis.map((k,i)=>(<div key={i} style={{background:'rgba(255,255,255,0.08)',borderRadius:10,padding:'9px 10px'}}><div style={{fontSize:9,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.07em',fontWeight:600,marginBottom:3}}>{k.l}</div><div style={{fontSize:kpis.length===4?11:12,fontWeight:700,color:k.c,fontFamily:T.mono}}>{k.v}</div></div>))}
    </div>
    <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:10}}><Spark trend={trend} mode={sparkMode??'budget'}/></div>
  </div>
)

// ─────────────────────────────────────────────────────────────────
// ACCOUNTS LIST
// ─────────────────────────────────────────────────────────────────
const AccountList = ({accounts,sel,onSel,pal}:{accounts:Account[],sel:string|null,onSel:(id:string|null)=>void,pal:{accent:string,soft:string}}) => (
  <div style={{marginBottom:20}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'0 2px',minHeight:26}}>
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
const CatRow = ({nome,v,pct,cor,icon,last,onClick}:{nome:string,v:number,pct:number,cor:string,icon:string,last:boolean,onClick?:()=>void}) => (
  <div onClick={onClick} style={{padding:'10px 16px',borderBottom:last?'none':`1px solid ${T.border}`,cursor:onClick?'pointer':'default'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
      <div style={{display:'flex',alignItems:'center',gap:9}}><span style={{fontSize:16}}>{icon}</span><span style={{fontSize:13,color:T.text}}>{nome}</span></div>
      <div style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:10,color:T.textTer,fontWeight:500}}>{pct}%</span><span style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:T.mono,minWidth:72,textAlign:'right'}}>{dec(v)}</span></div>
    </div>
    <div style={{height:3,borderRadius:2,background:T.border}}><div style={{width:`${pct}%`,height:'100%',borderRadius:2,background:cor}}/></div>
  </div>
)
const TxnRow = ({t,last,onClick,accounts}:{t:Transaction,last:boolean,onClick?:()=>void,accounts?:Account[]}) => {
  const accountName = accounts?.find(a=>a.id===t.account_id)?.nome
  return (
  <div onClick={onClick} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',borderBottom:last?'none':`1px solid ${T.border}`,cursor:onClick?'pointer':'default'}}>
    <div style={{width:38,height:38,borderRadius:12,background:T.surface2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,flexShrink:0}}>{getCatStyle(t.categoria??'Despesas Gerais').icon}</div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:13,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.descritivo}</div>
      <div style={{fontSize:11,color:T.textSec,marginTop:2}}>
        {accountName&&<span style={{color:T.textTer}}>{accountName} · </span>}{t.categoria??'Sem categoria'} · {t.data}
      </div>
    </div>
    {onClick&&<Edit2 size={13} color={T.textTer} style={{flexShrink:0}}/>}
    <div style={{fontSize:13,fontWeight:700,color:t.valor>=0?T.green:T.red,fontFamily:T.mono,whiteSpace:'nowrap'}}>{t.valor>=0?'+ ':'− '}{dec(Math.abs(t.valor))}</div>
  </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TRANSACTION EDIT FORM
// ─────────────────────────────────────────────────────────────────
const TxnEditForm = ({txn,onClose,onSaved,pal,imoveis,accounts}:{txn:Transaction,onClose:()=>void,onSaved:()=>void,pal:{accent:string,soft:string},imoveis?:Imovel[],accounts?:Account[]}) => {
  const [descritivo,setDescritivo] = useState(txn.descritivo)
  const [valor,setValor] = useState(String(txn.valor))
  const [categoria,setCategoria] = useState(txn.valor>=0?'Receita':(txn.categoria??'Despesas Gerais'))
  const [data,setData] = useState(txn.data)
  const [tipo,setTipo] = useState(txn.valor>=0?'receita':'despesa')
  const [imovelId,setImovelId] = useState(txn.imovel_id ?? '')
  const [saving,setSaving] = useState(false)
  const hasImoveis = imoveis && imoveis.length>0

  // Receita não tem categoria à escolha — é sempre "Receita", sem ambiguidade
  const setTipoEColarCategoria = (novoTipo:string) => {
    setTipo(novoTipo)
    if(novoTipo==='receita') setCategoria('Receita')
    else if(categoria==='Receita') setCategoria('Despesas Gerais') // ao voltar para despesa, sai do valor inválido "Receita"
  }

  const submit = async () => {
    setSaving(true)
    const absVal = Math.abs(parseNum(valor))
    const finalVal = tipo==='receita' ? absVal : -absVal
    const finalCategoria = tipo==='receita' ? 'Receita' : categoria
    const fields:any = { descritivo, valor:finalVal, categoria:finalCategoria, data, categoria_confirmada:true }
    if(hasImoveis){
      fields.imovel_id = imovelId || null
      fields.imovel_classificado = true
    }
    await updateTransaction(txn.id, fields)
    // Aprendizagem: reforça/cria a regra com base na categoria escolhida manualmente
    // (regras de "Receita" não trazem grande valor preditivo, mas não fazem mal)
    await learnFromCategorization(descritivo, finalCategoria)
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
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,color:T.text}}>Editar Transação</div>
            {accounts&&<div style={{fontSize:11,color:T.textTer,marginTop:2}}>{accounts.find(a=>a.id===txn.account_id)?.nome ?? ''}</div>}
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer'}}><X size={18} color={T.textSec}/></button>
        </div>
        <div style={{padding:'20px 18px'}}>
          <Inp label="Descritivo" value={descritivo} onChange={setDescritivo}/>
          <Sel label="Tipo" value={tipo} onChange={setTipoEColarCategoria} options={[{value:'despesa',label:'🔴 Despesa'},{value:'receita',label:'🟢 Receita'}]}/>
          <MoneyInp label="Valor (€)" value={valor.replace('-','')} onChange={setValor}/>
          {tipo==='receita'?(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:T.textSec,fontWeight:600,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Categoria</div>
              <div style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px',color:T.textSec,fontSize:13,display:'flex',alignItems:'center',gap:6}}>💰 Receita</div>
            </div>
          ):(
            <Sel label="Categoria" value={categoria} onChange={setCategoria} options={CAT_LIST.filter(c=>c!=='Receita').map(c=>({value:c,label:`${getCatStyle(c).icon} ${c}`}))}/>
          )}
          {hasImoveis&&<Sel label="Imóvel associado" value={imovelId} onChange={setImovelId} options={[{value:'',label:'Geral (nenhum imóvel)'},...imoveis!.map(im=>({value:im.id,label:`🏠 ${im.nome}`}))]}/>}
          <DateInp label="Data" value={data} onChange={setData}/>
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
type Filters = { dateFrom:string, dateTo:string, tipo:string, valMin:string, valMax:string, categoria:string, conta:string, imovel:string }
const emptyFilters:Filters = { dateFrom:'', dateTo:'', tipo:'todos', valMin:'', valMax:'', categoria:'todas', conta:'todas', imovel:'todos' }

const FilterSheet = ({filters,onApply,onClose,pal,tagAccounts,imoveis}:{filters:Filters,onApply:(f:Filters)=>void,onClose:()=>void,pal:{accent:string,soft:string},tagAccounts?:{id:string,nome:string}[],imoveis?:{id:string,nome:string}[]}) => {
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
          {tagAccounts&&tagAccounts.length>1&&(
            <Sel label="Conta" value={f.conta} onChange={upd('conta')} options={[{value:'todas',label:'Todas as contas'},...tagAccounts.map(a=>({value:a.id,label:a.nome}))]}/>
          )}
          {imoveis&&imoveis.length>1&&(
            <Sel label="Imóvel" value={f.imovel} onChange={upd('imovel')} options={[{value:'todos',label:'Todos os imóveis'},...imoveis.map(i=>({value:i.id,label:i.nome}))]}/>
          )}
          <div style={{fontSize:11,color:T.textTer,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:10}}>Intervalo de datas</div>
          <div style={{display:'flex',gap:10}}>
            <div style={{flex:1}}><DateInp label="De" value={f.dateFrom} onChange={upd('dateFrom')}/></div>
            <div style={{flex:1}}><DateInp label="Até" value={f.dateTo} onChange={upd('dateTo')}/></div>
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
  const [cat,setCat] = useState('Despesas Gerais')
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
const AllTransactionsScreen = ({allTxns,accounts,tag,pal,onClose,onRefresh,imoveis,initialCategoria,initialContaId,initialImovelId}:{allTxns:Transaction[],accounts:Account[],tag:string,pal:{grad:string,accent:string,soft:string},onClose:()=>void,onRefresh:()=>void,imoveis?:Imovel[],initialCategoria?:string,initialContaId?:string,initialImovelId?:string}) => {
  const [filters,setFilters] = useState<Filters>({
    ...emptyFilters,
    ...(initialCategoria ? {categoria:initialCategoria} : {}),
    ...(initialContaId ? {conta:initialContaId} : {}),
    ...(initialImovelId ? {imovel:initialImovelId} : {}),
  })
  const [showFilters,setShowFilters] = useState(false)
  const [selectMode,setSelectMode] = useState(false)
  const [selected,setSelected] = useState<Set<string>>(new Set())
  const [editTxn,setEditTxn] = useState<Transaction|null>(null)
  const [showRecat,setShowRecat] = useState(false)

  // Contas da tab activa
  const tagAccountIds = useMemo(()=>new Set(accounts.filter(a=>a.budget_tag===tag).map(a=>a.id)),[accounts,tag])
  const tagAccounts = useMemo(()=>accounts.filter(a=>a.budget_tag===tag),[accounts,tag])

  // Aplicar filtros
  const filtered = useMemo(()=>{
    return allTxns.filter(t=>{
      if(!tagAccountIds.has(t.account_id)) return false
      if(filters.conta!=='todas' && t.account_id!==filters.conta) return false
      if(filters.dateFrom && t.data < filters.dateFrom) return false
      if(filters.dateTo && t.data > filters.dateTo) return false
      if(filters.tipo==='receita' && t.valor<0) return false
      if(filters.tipo==='despesa' && t.valor>=0) return false
      if(filters.categoria!=='todas' && t.categoria!==filters.categoria) return false
      if(filters.imovel!=='todos' && t.imovel_id!==filters.imovel) return false
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
    const selectedTxns = filtered.filter(t=>selected.has(t.id))
    await recategorizeTransactions(Array.from(selected), cat)
    // Aprendizagem: reforça/cria regras para cada descritivo recategorizado em lote
    for(const t of selectedTxns) await learnFromCategorization(t.descritivo, cat)
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
                  const accountName = accounts.find(a=>a.id===t.account_id)?.nome
                  return (
                    <div key={t.id} onClick={()=>selectMode?toggleSel(t.id):setEditTxn(t)} style={{display:'flex',alignItems:'center',gap:11,padding:'11px 14px',borderBottom:i<txns.length-1?`1px solid ${T.border}`:'none',cursor:'pointer',background:isSel?pal.soft:'transparent',transition:'background 0.12s'}}>
                      {selectMode&&<div style={{flexShrink:0}}>{isSel?<CheckSquare size={18} color={pal.accent}/>:<Square size={18} color={T.textTer}/>}</div>}
                      <div style={{width:36,height:36,borderRadius:11,background:T.surface2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>{getCatStyle(t.categoria??'Despesas Gerais').icon}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.descritivo}</div>
                        <div style={{fontSize:11,color:T.textSec,marginTop:2}}>
                          {accountName&&<span style={{color:T.textTer}}>{accountName} · </span>}{t.categoria??'Sem categoria'} · {t.data}
                        </div>
                      </div>
                      {!selectMode&&<Edit2 size={13} color={T.textTer} style={{flexShrink:0}}/>}
                      <div style={{fontSize:13,fontWeight:700,color:t.valor>=0?T.green:T.red,fontFamily:T.mono,whiteSpace:'nowrap'}}>{t.valor>=0?'+ ':'− '}{dec(Math.abs(t.valor))}</div>
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

      {showFilters&&<FilterSheet filters={filters} onApply={setFilters} onClose={()=>setShowFilters(false)} pal={pal} tagAccounts={tagAccounts} imoveis={imoveis?.map(i=>({id:i.id,nome:i.nome}))}/>}
      {editTxn&&<TxnEditForm txn={editTxn} onClose={()=>setEditTxn(null)} onSaved={onRefresh} pal={pal} imoveis={imoveis} accounts={accounts}/>}
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
          {/* form real para que browsers/iOS/Android ofereçam guardar a password */}
          <form onSubmit={e=>{e.preventDefault();login()}} autoComplete="on">
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:T.textSec,fontWeight:600,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Email</div>
              <input name="email" type="email" autoComplete="username email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="o-teu@email.com"
                style={{width:'100%',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px',color:T.text,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:T.textSec,fontWeight:600,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Password</div>
              <input name="password" type="password" autoComplete="current-password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••"
                style={{width:'100%',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px',color:T.text,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
            </div>
            {err&&<div style={{fontSize:12,color:T.red,marginBottom:12}}>{err}</div>}
            <button type="submit" disabled={loading} style={{width:'100%',background:PAL.familiar.accent,color:'#0B0B12',border:'none',borderRadius:10,padding:'12px',fontSize:14,fontWeight:700,cursor:'pointer'}}>{loading?'A entrar…':'Entrar'}</button>
          </form>
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
    if(isEdit) {
      const updatePayload: any = { ...payload }
      if(form.tipo === 'poupança') updatePayload.saldo_data = new Date().toISOString().split('T')[0]
      await updateAccount(initial!.id, updatePayload)
    } else {
      const res = await saveAccount({...payload, saldo_data:null, drive_folder_id:null, drive_folder_name:null, moeda:'EUR', ativa:true, ordem:accountsLen})
      if(res.error) { console.error('saveAccount error:', res.error); setSaving(false); alert('Erro ao criar conta: ' + res.error.message); return }
    }
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
            form.tipo === 'poupança' ? (
              <MoneyInp label="Saldo actual (€)" value={form.saldo_atual} onChange={f('saldo_atual')} hint="Actualiza manualmente quando constituíres, renovares ou resgates o depósito."/>
            ) : (
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:T.textSec,fontWeight:600,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.06em'}}>Saldo actual</div>
                <div style={{background:T.surface3,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px',color:T.textSec,fontSize:13,fontFamily:T.mono}}>{dec(Number(form.saldo_atual)||0)}</div>
                <div style={{fontSize:11,color:T.textSec,marginTop:5,lineHeight:1.5}}>Actualizado automaticamente a cada extracto importado. Não é editável manualmente.</div>
              </div>
            )
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
// ALL CATEGORIES SCREEN — grid 2 colunas, toque vai a transações filtradas
// ─────────────────────────────────────────────────────────────────
const AllCategoriesScreen = ({transactions,accounts,tag,sel,initialMonth,subtitle,onClose,onSelectCategoria,pal}:{transactions:Transaction[],accounts:Account[],tag:string,sel:string|null,initialMonth:string|null,subtitle:string,onClose:()=>void,onSelectCategoria:(categoria:string,month:string)=>void,pal:{accent:string,soft:string}}) => {
  // Usa o mesmo mês que o BudgetScreen tinha quando foi aberto, mas permite navegar independentemente
  const allTagAccs = accounts.filter(a=>a.budget_tag===tag)
  const allTxns = transactions.filter(t=>(sel?t.account_id===sel:allTagAccs.some(a=>a.id===t.account_id)))
  const latestMonth = latestMonthWithData(allTxns)

  const [monthOffset,setMonthOffset] = useState(()=>{
    // calcula offset inicial baseado no mês que estava aberto no BudgetScreen
    if(!initialMonth||!latestMonth) return 0
    const [ly,lm]=latestMonth.split('-').map(Number)
    const [iy,im]=initialMonth.split('-').map(Number)
    return (iy-ly)*12+(im-lm)
  })

  const currentMonth = useMemo(()=>{
    if(!latestMonth) return null
    const [ly,lm]=latestMonth.split('-').map(Number)
    const d=new Date(ly,lm-1,1); d.setMonth(d.getMonth()+monthOffset)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  },[latestMonth,monthOffset])

  const cats = useMemo(()=>{
    if(!currentMonth) return []
    const monthTxns = allTxns.filter(t=>t.data.startsWith(currentMonth)&&t.valor<0&&t.categoria)
    const catMap:Record<string,number>={}
    monthTxns.forEach(t=>{catMap[t.categoria!]=(catMap[t.categoria!]||0)+Math.abs(t.valor)})
    const total=Object.values(catMap).reduce((s,v)=>s+v,0)||1
    return Object.entries(catMap).map(([nome,v])=>({nome,v,pct:Math.round(v/total*100),...getCatStyle(nome)})).sort((a,b)=>b.v-a.v)
  },[allTxns,currentMonth])

  const canGoForward = monthOffset < 0
  const period = monthYearLabel(currentMonth)

  return (
    <div style={{position:'fixed',inset:0,background:T.bg,zIndex:85,overflowY:'auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <div style={{maxWidth:440,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:T.surface,borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,zIndex:10}}>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ArrowLeft size={18} color={T.textSec}/></button>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:700,color:T.text}}>Todas as categorias</div>
            <div style={{fontSize:11,color:T.textSec}}>{subtitle}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <button onClick={()=>setMonthOffset(o=>o-1)} style={{background:'none',border:'none',cursor:'pointer',padding:'4px 8px',color:T.textSec,fontSize:18,lineHeight:1}}>‹</button>
            <span style={{fontSize:12,color:T.text,fontWeight:600,minWidth:60,textAlign:'center'}}>{period}</span>
            <button onClick={()=>{if(canGoForward)setMonthOffset(o=>o+1)}} style={{background:'none',border:'none',cursor:canGoForward?'pointer':'default',padding:'4px 8px',color:canGoForward?T.textSec:T.border,fontSize:18,lineHeight:1}}>›</button>
          </div>
        </div>
        <div style={{padding:14}}>
          {cats.length===0&&<Card><div style={{padding:32,textAlign:'center',color:T.textSec,fontSize:13}}>Sem despesas em {period}.</div></Card>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {cats.map((c,i)=>(
              <div key={i} onClick={()=>currentMonth&&onSelectCategoria(c.nome,currentMonth)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:12,cursor:'pointer'}}>
                <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:6}}>
                  <span style={{fontSize:16}}>{c.icon}</span>
                  <span style={{fontSize:11,color:T.text,fontWeight:600,flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.nome}</span>
                </div>
                <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:13,color:T.text,fontWeight:700,fontFamily:T.mono}}>{dec(c.v)}</span>
                  <span style={{fontSize:9,color:T.textTer,fontWeight:600}}>{c.pct}%</span>
                </div>
                <div style={{height:3,borderRadius:2,background:T.border}}><div style={{width:`${c.pct}%`,height:'100%',borderRadius:2,background:c.cor}}/></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// RULES SCREEN — gestão de regras de categorização aprendidas (com bulk)
// ─────────────────────────────────────────────────────────────────
const RulesScreen = ({onClose,pal}:{onClose:()=>void,pal:{accent:string,soft:string}}) => {
  const [rules,setRules] = useState<CategoryRule[]>([])
  const [loading,setLoading] = useState(true)
  const [selectMode,setSelectMode] = useState(false)
  const [selected,setSelected] = useState<Set<string>>(new Set())
  const [showRecat,setShowRecat] = useState(false)

  const load = useCallback(async()=>{ setLoading(true); const r = await loadCategoryRules(); setRules(r); setLoading(false) },[])
  useEffect(()=>{ load() },[load])

  const toggleSel = (id:string) => { const n=new Set(selected); n.has(id)?n.delete(id):n.add(id); setSelected(n) }
  const selectAll = () => { selected.size===rules.length ? setSelected(new Set()) : setSelected(new Set(rules.map(r=>r.id))) }
  const doDelete = async () => {
    if(!confirm(`Apagar ${selected.size} regras? As transações já categorizadas não são afectadas.`)) return
    await deleteCategoryRules(Array.from(selected))
    setSelected(new Set()); setSelectMode(false); await load()
  }
  const doDeleteOne = async (id:string) => {
    if(!confirm('Apagar esta regra?')) return
    await deleteCategoryRule(id); await load()
  }
  const doRecatRules = async (cat:string) => {
    for(const id of Array.from(selected)) await updateCategoryRule(id, cat)
    setShowRecat(false); setSelected(new Set()); setSelectMode(false); await load()
  }

  return (
    <div style={{position:'fixed',inset:0,background:T.bg,zIndex:90,overflowY:'auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <div style={{maxWidth:440,margin:'0 auto'}}>
        <div style={{position:'sticky',top:0,zIndex:10,background:T.surface,borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px'}}>
            <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ArrowLeft size={18} color={T.textSec}/></button>
            <div style={{flex:1}}>
              <div style={{fontSize:16,fontWeight:700,color:T.text}}>Regras Aprendidas</div>
              <div style={{fontSize:11,color:T.textSec}}>{rules.length} padrões guardados</div>
            </div>
            <button onClick={()=>{setSelectMode(!selectMode);setSelected(new Set())}} style={{background:selectMode?pal.accent:T.surface2,border:'none',borderRadius:10,padding:'7px 10px',cursor:'pointer'}}>
              <CheckSquare size={14} color={selectMode?'#0B0B12':T.textSec}/>
            </button>
          </div>
          {selectMode&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',background:pal.soft,borderTop:`1px solid ${T.border}`}}>
              <button onClick={selectAll} style={{display:'flex',alignItems:'center',gap:6,background:'none',border:'none',cursor:'pointer'}}>
                {selected.size===rules.length&&rules.length>0?<CheckSquare size={16} color={pal.accent}/>:<Square size={16} color={T.textSec}/>}
                <span style={{fontSize:12,color:pal.accent,fontWeight:600}}>{selected.size>0?`${selected.size} selecionadas`:'Selecionar todas'}</span>
              </button>
            </div>
          )}
        </div>

        <div style={{padding:'14px 14px 100px'}}>
          <Card style={{background:pal.soft,padding:'12px 14px',marginBottom:16}}>
            <div style={{fontSize:12,color:T.textSec,lineHeight:1.6}}>
              <BrainCircuit size={13} style={{display:'inline',marginRight:4,verticalAlign:-2}}/>
              Sempre que categorizas uma transação manualmente (ou aceitas uma sugestão da IA), a app guarda o padrão aqui. Nas próximas importações, estas regras têm prioridade sobre a IA.
            </div>
          </Card>

          {loading&&<div style={{textAlign:'center',padding:32,color:T.textSec,fontSize:13}}>A carregar…</div>}
          {!loading&&rules.length===0&&<Card><div style={{padding:32,textAlign:'center',color:T.textSec,fontSize:13}}>Ainda sem regras. Categoriza algumas transações para começares a ensinar a app.</div></Card>}

          {rules.map((r,i)=>{
            const isSel = selected.has(r.id)
            return (
              <Card key={r.id} style={{marginBottom:8,padding:'12px 14px',background:isSel?pal.soft:T.surface}}>
                <div onClick={()=>selectMode?toggleSel(r.id):undefined} style={{display:'flex',alignItems:'center',gap:10,cursor:selectMode?'pointer':'default'}}>
                  {selectMode&&<div style={{flexShrink:0}}>{isSel?<CheckSquare size={18} color={pal.accent}/>:<Square size={18} color={T.textTer}/>}</div>}
                  <div style={{width:34,height:34,borderRadius:10,background:T.surface2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0}}>{getCatStyle(r.categoria).icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>"{r.pattern}"</div>
                    <div style={{fontSize:11,color:T.textSec,marginTop:1}}>→ {r.categoria} · usada {r.vezes_usada}×</div>
                  </div>
                  {!selectMode&&<button onClick={()=>doDeleteOne(r.id)} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><Trash2 size={14} color={T.textTer}/></button>}
                </div>
              </Card>
            )
          })}
        </div>

        {selectMode && selected.size>0 && (
          <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:440,background:T.surface,borderTop:`1px solid ${T.border}`,padding:'12px 16px 20px',display:'flex',gap:10,zIndex:20}}>
            <Btn onClick={()=>setShowRecat(true)} variant="ghost" accent={pal.accent} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}><Tag size={15}/> Mudar categoria</Btn>
            <Btn onClick={doDelete} variant="danger" accent={pal.accent} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}><Trash2 size={15}/> Apagar ({selected.size})</Btn>
          </div>
        )}
      </div>
      {showRecat&&<RecategorizeSheet count={selected.size} onApply={doRecatRules} onClose={()=>setShowRecat(false)} pal={pal}/>}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────
// NOTIFICATIONS SCREEN
// ─────────────────────────────────────────────────────────────────
// T212 SETTINGS SCREEN
// ─────────────────────────────────────────────────────────────────
// ENABLE BANKING SCREEN
// ─────────────────────────────────────────────────────────────────
const EnableBankingScreen = ({onClose,accounts,onRefresh,pal}:{onClose:()=>void,accounts:Account[],onRefresh:()=>void,pal:{accent:string,soft:string}}) => {
  const [status,setStatus] = useState<any>(null)
  const [loading,setLoading] = useState(true)
  const [syncing,setSyncing] = useState<string|null>(null)
  const [syncResult,setSyncResult] = useState<any>(null)
  const [linkingUid,setLinkingUid] = useState<string|null>(null)

  const load = useCallback(async()=>{
    setLoading(true)
    const s = await getEnableBankingStatus()
    setStatus(s)
    setLoading(false)
  },[])

  useEffect(()=>{ load() },[load])

  useEffect(()=>{
    const params = new URLSearchParams(window.location.search)
    if(params.get('eb_connected')){ load(); window.history.replaceState({},'',' ') }
  },[load])

  const connect = async (bank:string, country:string) => {
    const url = await startEnableBankingConnect(bank, country)
    if(url) window.location.href = url
  }

  const sync = async (accountUid?:string) => {
    setSyncing(accountUid ?? 'all'); setSyncResult(null)
    const result = await syncEnableBanking(accountUid)
    setSyncResult(result)
    setSyncing(null)
    await onRefresh()
  }

  const linkAccount = async (accountUid:string, appAccountId:string) => {
    await linkEnableBankingAccount(accountUid, appAccountId)
    await load()
    setLinkingUid(null)
  }

  const unlinkAccount = async (accountUid:string) => {
    if(!confirm('Desassociar esta conta? O histórico de transações é mantido.')) return
    await unlinkEnableBankingAccount(accountUid)
    await load()
  }

  const daysLeft = (validUntil:string) => {
    const days = Math.floor((new Date(validUntil).getTime()-Date.now())/(1000*60*60*24))
    return days > 0 ? `${days} dias` : 'Expirado'
  }

  return (
    <div style={{position:'fixed',inset:0,background:T.bg,zIndex:90,overflowY:'auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <div style={{maxWidth:440,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:T.surface,borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,zIndex:10}}>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ArrowLeft size={18} color={T.textSec}/></button>
          <div style={{fontSize:16,fontWeight:700,color:T.text,flex:1}}>Enable Banking</div>
        </div>
        <div style={{padding:'16px 14px'}}>
          {loading&&<div style={{padding:32,textAlign:'center',color:T.textSec,fontSize:13}}>A verificar ligações…</div>}
          {!loading&&(
            <>
              <div style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase',marginBottom:8}}>Ligar banco</div>
              <Card style={{marginBottom:16}}>
                {[
                  {name:'Revolut',country:'PT',label:'Revolut',domain:'revolut.com',color:'#000000'},
                  {name:'Abanca',country:'PT',label:'Abanca',domain:'abanca.pt',color:'#5B87DA'},
                  {name:'Millennium BCP',country:'PT',label:'Millennium BCP',domain:'millenniumbcp.pt',color:'#CC0066'},
                  {name:'Santander',country:'PT',label:'Santander',domain:'santander.pt',color:'#EC0000'},
                  {name:'Caixa Geral de Depósitos',country:'PT',label:'CGD',domain:'cgd.pt',color:'#0072C6'},
                ].map((bank,i,arr)=>{
                  const linked=(status?.sessions??[]).some((s:any)=>s.bank_name===bank.name&&!s.expired)
                  return (
                    <div key={bank.name} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderBottom:i<arr.length-1?`1px solid ${T.border}`:'none'}}>
                      <div style={{width:32,height:32,borderRadius:8,background:T.surface2,border:`0.5px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${bank.domain}&sz=64`}
                          width={20} height={20}
                          alt={bank.label}
                          onError={(e)=>{
                            const t = e.currentTarget
                            t.style.display='none'
                            const fb = t.nextElementSibling as HTMLElement
                            if(fb) fb.style.display='block'
                          }}
                          style={{display:'block'}}
                        />
                        <div style={{display:'none',width:20,height:20,borderRadius:'50%',background:bank.color,flexShrink:0}}/>
                      </div>
                      <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.text}}>{bank.label}</div>{linked&&<div style={{fontSize:10,color:T.green,marginTop:1}}>Ligado</div>}</div>
                      <button onClick={()=>connect(bank.name,bank.country)} style={{background:linked?T.surface2:pal.accent,color:linked?T.textSec:'#0B0B12',border:'none',borderRadius:8,padding:'6px 12px',fontSize:11,fontWeight:600,cursor:'pointer'}}>{linked?'Re-ligar':'Ligar'}</button>
                    </div>
                  )
                })}
              </Card>
              {(status?.sessions??[]).length>0&&(
                <>
                  <div style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase',marginBottom:8}}>Contas ligadas</div>
                  {(status.sessions).map((s:any,si:number)=>(
                    <Card key={si} style={{marginBottom:12}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderBottom:`1px solid ${T.border}`}}>
                        <div style={{width:32,height:32,borderRadius:8,background:s.expired?'rgba(248,113,113,0.1)':'rgba(74,222,128,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>🏦</div>
                        <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.text}}>{s.bank_name}</div><div style={{fontSize:10,color:s.expired?T.red:T.textTer}}>{daysLeft(s.valid_until)} restantes</div></div>
                      </div>
                      {(s.accounts??[]).map((acc:any,ai:number)=>{
                        const isSyncing=syncing===acc.account_uid
                        const linkedAccount = accounts.find((a:Account)=>a.id===acc.account_id)
                        return (
                          <div key={acc.account_uid} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderBottom:ai<(s.accounts??[]).length-1?`1px solid ${T.border}`:'none'}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:12,color:T.text,fontWeight:600}}>{acc.name??acc.iban?.slice(-8)??acc.account_uid.slice(0,12)+'…'}</div>
                              {acc.iban&&<div style={{fontSize:10,color:T.textTer}}>{acc.iban}</div>}
                              {linkedAccount
                                ? <div style={{fontSize:10,color:T.green,marginTop:2}}>↳ {linkedAccount.nome}</div>
                                : <div style={{fontSize:10,color:'#FBBF24',marginTop:2}}>⚠ Sem conta associada</div>
                              }
                            </div>
                            <div style={{display:'flex',gap:6,flexShrink:0}}>
                              {acc.account_id&&<button onClick={()=>!syncing&&sync(acc.account_uid)} disabled={!!syncing} style={{background:pal.soft,color:pal.accent,border:'none',borderRadius:8,padding:'5px 10px',fontSize:11,fontWeight:600,cursor:syncing?'default':'pointer',opacity:syncing?0.5:1,display:'flex',alignItems:'center',gap:4}}><RefreshCw size={11}/>{isSyncing?'…':'Sync'}</button>}
                              <button onClick={()=>setLinkingUid(acc.account_uid)} style={{background:T.surface2,color:T.textSec,border:'none',borderRadius:8,padding:'5px 10px',fontSize:11,cursor:'pointer'}}>{acc.account_id?'Alterar':'Associar'}</button>
                              {acc.account_id&&<button onClick={()=>unlinkAccount(acc.account_uid)} title="Desassociar" style={{background:'rgba(248,113,113,0.1)',color:T.red,border:'none',borderRadius:8,padding:'5px 8px',fontSize:11,cursor:'pointer'}}><X size={11}/></button>}
                            </div>
                          </div>
                        )
                      })}
                    </Card>
                  ))}
                  {syncResult&&!syncing&&(
                    <Card style={{padding:'10px 14px',marginBottom:12}}>
                      <div style={{fontSize:12,fontWeight:600,color:T.text,marginBottom:6}}>{syncResult.ok?'✓ Sincronizado':'✗ Erro'}</div>
                      {(syncResult.results??[]).map((r:any,i:number)=>(
                        <div key={i} style={{fontSize:11,padding:'4px 0',borderBottom:i<(syncResult.results??[]).length-1?`1px solid ${T.border}`:'none'}}>
                          <span style={{fontWeight:600,color:T.text}}>{r.accountName??r.bank}</span>
                          {r.error?<span style={{color:T.red}}> — {r.error}</span>:<span style={{color:T.textSec}}> — €{r.balance?.toFixed(2)} · <span style={{color:r.newTxns>0?T.green:T.textTer}}>{r.newTxns} nova{r.newTxns!==1?'s':''}</span></span>}
                        </div>
                      ))}
                    </Card>
                  )}
                  <Btn onClick={()=>!syncing&&sync()} variant="primary" accent={pal.accent} style={{width:'100%',opacity:syncing?0.5:1}}>{syncing==='all'?'A sincronizar todas…':'↻ Sincronizar todas as contas'}</Btn>
                </>
              )}
              <div style={{fontSize:11,color:T.textTer,lineHeight:1.6,marginTop:12,padding:'0 4px'}}>ℹ️ A autorização é válida por 180 dias. A sincronização automática corre de madrugada.</div>
            </>
          )}
        </div>
      </div>
      {linkingUid&&(
        <div onClick={()=>setLinkingUid(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:120,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:'20px 20px 0 0',width:'100%',maxWidth:440,padding:'20px 18px 32px'}}>
            <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Associar a conta da app</div>
            <div style={{fontSize:11,color:T.textSec,marginBottom:14}}>Selecciona a conta onde queres escrever o saldo e transacções deste banco:</div>
            <Card>{accounts.map((a,i)=>(<div key={a.id} onClick={()=>linkAccount(linkingUid,a.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderBottom:i<accounts.length-1?`1px solid ${T.border}`:'none',cursor:'pointer'}}><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:T.text}}>{a.nome}</div><div style={{fontSize:11,color:T.textSec}}>{a.banco} · {a.tipo}</div></div><ChevronRight size={14} color={T.textTer}/></div>))}</Card>
          </div>
        </div>
      )}
    </div>
  )
}

const T212Screen = ({onClose,accounts,onRefresh,pal}:{onClose:()=>void,accounts:Account[],onRefresh:()=>void,pal:{accent:string,soft:string}}) => {
  const [status,setStatus] = useState<any>(null)
  const [loading,setLoading] = useState(true)
  const [syncing,setSyncing] = useState(false)
  const [selAccount,setSelAccount] = useState('')
  const [syncResult,setSyncResult] = useState<any>(null)

  const load = useCallback(async()=>{
    setLoading(true)
    const [s, cfg] = await Promise.all([getT212Status(), loadT212Config()])
    setStatus(s)
    // Pre-preenche a conta guardada anteriormente
    if(cfg.length > 0) setSelAccount(cfg[0].account_id)
    setLoading(false)
  },[])

  useEffect(()=>{ load() },[load])

  const sync = async () => {
    if(!selAccount){ alert('Selecciona a conta da app que corresponde ao T212'); return }
    setSyncing(true); setSyncResult(null)
    const result = await syncT212(selAccount)
    setSyncResult(result)
    setSyncing(false)
    await onRefresh()
  }

  const isConfigured = status?.connected
  const allAccounts = accounts

  return (
    <div style={{position:'fixed',inset:0,background:T.bg,zIndex:90,overflowY:'auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <div style={{maxWidth:440,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:T.surface,borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,zIndex:10}}>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ArrowLeft size={18} color={T.textSec}/></button>
          <div style={{fontSize:16,fontWeight:700,color:T.text,flex:1}}>Trading 212</div>
        </div>
        <div style={{padding:'16px 14px'}}>
          {loading&&<div style={{padding:32,textAlign:'center',color:T.textSec,fontSize:13}}>A verificar ligação…</div>}

          {!loading&&!isConfigured&&(
            <Card style={{padding:16,textAlign:'center'}}>
              <div style={{fontSize:28,marginBottom:10}}>📈</div>
              <div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:6}}>T212 não configurado</div>
              <div style={{fontSize:11,color:T.textSec,lineHeight:1.6,marginBottom:14}}>Adiciona as variáveis de ambiente no Vercel e faz redeploy:</div>
              <div style={{background:T.surface2,borderRadius:8,padding:'10px 12px',textAlign:'left',marginBottom:8}}>
                <div style={{fontSize:10,color:T.green,fontFamily:'monospace',lineHeight:1.8}}>
                  T212_API_KEY=…<br/>T212_API_SECRET=…
                </div>
              </div>
              <div style={{fontSize:11,color:T.textTer}}>T212 → Settings → API (Beta) → Generate API key<br/>Activa as permissões: Account, Portfolio, History</div>
            </Card>
          )}

          {!loading&&isConfigured&&(
            <>
              {(status.accounts??[]).map((acc:any,i:number)=>(
                <Card key={i} style={{padding:14,marginBottom:12}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:acc.error?0:10}}>
                    <div style={{width:36,height:36,borderRadius:10,background:acc.error?'rgba(248,113,113,0.1)':'rgba(74,222,128,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>📈</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:T.text}}>T212 {acc.label}</div>
                      {acc.error?<div style={{fontSize:11,color:T.red,marginTop:2}}>{acc.error}</div>:(
                        <div style={{fontSize:11,color:T.green}}>Ligado · Total €{acc.total?.toFixed(2)}</div>
                      )}
                    </div>
                  </div>
                  {!acc.error&&(
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
                      <div style={{background:T.surface2,borderRadius:8,padding:'7px 9px'}}>
                        <div style={{fontSize:9,color:T.textTer,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>Cash livre</div>
                        <div style={{fontSize:12,fontWeight:700,color:T.text,fontFamily:T.mono}}>€{acc.cash?.toFixed(0)}</div>
                      </div>
                      <div style={{background:T.surface2,borderRadius:8,padding:'7px 9px'}}>
                        <div style={{fontSize:9,color:T.textTer,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>Posições</div>
                        <div style={{fontSize:12,fontWeight:700,color:T.text,fontFamily:T.mono}}>€{acc.marketValue?.toFixed(0)}</div>
                      </div>
                      <div style={{background:T.surface2,borderRadius:8,padding:'7px 9px'}}>
                        <div style={{fontSize:9,color:T.textTer,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>P&L</div>
                        <div style={{fontSize:12,fontWeight:700,color:(acc.ppl??0)>=0?T.green:T.red,fontFamily:T.mono}}>{(acc.ppl??0)>=0?'+':''}€{Math.abs(acc.ppl??0).toFixed(0)}</div>
                      </div>
                    </div>
                  )}
                </Card>
              ))}

              <div style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase',marginBottom:8,marginTop:4}}>Conta da app associada</div>
              <Card style={{padding:14,marginBottom:12}}>
                <div style={{fontSize:11,color:T.textSec,marginBottom:10,lineHeight:1.5}}>O saldo e as transacções do T212 serão escritos nesta conta. Fica guardado para sincronizações futuras.</div>
                <Sel label="Conta" value={selAccount} onChange={setSelAccount} options={[{value:'',label:'Selecciona uma conta…'},...allAccounts.map(a=>({value:a.id,label:`${a.nome} (${a.tipo})`}))]}/>
                {syncResult&&!syncing&&(
                  <div style={{marginTop:10}}>
                    {(syncResult.results??[]).map((r:any,i:number)=>(
                      <div key={i} style={{padding:'8px 10px',background:r.error?'rgba(248,113,113,0.08)':r.warning?'rgba(251,191,36,0.08)':'rgba(74,222,128,0.08)',borderRadius:8,marginBottom:6}}>
                        {r.error?<div style={{fontSize:11,color:T.red}}>✗ {r.error}</div>:(
                          <>
                            <div style={{fontSize:11,color:T.green}}>✓ {r.account}: €{r.total?.toFixed(2)}{r.newTransactions!=null?` · ${r.newTransactions} transacção${r.newTransactions!==1?'s':''} nova${r.newTransactions!==1?'s':''}`:''}</div>
                            {r.warning&&<div style={{fontSize:10,color:'#FBBF24',marginTop:4}}>⚠ {r.warning}</div>}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Btn onClick={sync} variant="primary" accent={pal.accent} style={{width:'100%',opacity:selAccount&&!syncing?1:0.4}}>
                {syncing?'A sincronizar…':'↻ Sincronizar agora'}
              </Btn>
              <div style={{marginTop:12,fontSize:11,color:T.textTer,lineHeight:1.6,padding:'0 4px'}}>
                ℹ️ A sincronização automática corre todos os dias de madrugada.<br/>
                Apenas o saldo total é actualizado — não são importadas transacções individuais.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
const NotificationsScreen = ({onClose,pal}:{onClose:()=>void,pal:{accent:string,soft:string}}) => {
  const [notifs,setNotifs] = useState<AppNotification[]>([])
  const [loading,setLoading] = useState(true)
  const [expanded,setExpanded] = useState<string|null>(null)
  const [showCronModal,setShowCronModal] = useState(false)
  const [cronSecret,setCronSecret] = useState('')
  const [cronState,setCronState] = useState<'idle'|'running'|'done'|'error'>('idle')
  const [cronResult,setCronResult] = useState<any>(null)

  const load = useCallback(async()=>{
    setLoading(true)
    const data = await loadNotifications(50)
    setNotifs(data)
    setLoading(false)
    // Marca todas como lidas ao abrir
    await markNotificationsRead()
  },[])

  useEffect(()=>{ load() },[load])

  const del = async(id:string)=>{
    await deleteNotification(id)
    setNotifs(n=>n.filter(x=>x.id!==id))
  }

  const typeIcon = (type:AppNotification['type']) => {
    if(type==='import_error') return '⚠️'
    if(type==='cron_summary') return '🌙'
    if(type==='manual_import') return '📤'
    return '✅'
  }
  const typeColor = (type:AppNotification['type'],pal:{accent:string}) => {
    if(type==='import_error') return T.red
    if(type==='cron_summary') return '#818CF8'
    return pal.accent
  }
  const fmt = (iso:string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime()-d.getTime()
    const diffH = Math.floor(diffMs/3600000)
    const diffD = Math.floor(diffMs/86400000)
    if(diffH<1) return 'Agora mesmo'
    if(diffH<24) return `Há ${diffH}h`
    if(diffD<7) return `Há ${diffD} dia${diffD>1?'s':''}`
    return d.toLocaleDateString('pt-PT',{day:'numeric',month:'short'})
  }

  return (
    <div onClick={e=>e.stopPropagation()} style={{position:'fixed',inset:0,background:T.bg,zIndex:90,overflowY:'auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <div style={{maxWidth:440,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:T.surface,borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,zIndex:10}}>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ArrowLeft size={18} color={T.textSec}/></button>
          <div style={{fontSize:16,fontWeight:700,color:T.text,flex:1}}>Notificações</div>
          {notifs.length>0&&<button onClick={async()=>{await Promise.all(notifs.map(n=>deleteNotification(n.id)));setNotifs([])}} style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:T.textTer}}>Limpar tudo</button>}
          <button onClick={()=>{setShowCronModal(true);setCronState('idle');setCronResult(null)}} style={{background:'none',border:'none',cursor:'pointer',fontSize:10,color:T.textTer}}>▶ cron</button>
        </div>
        <div style={{padding:'12px 14px'}}>
          {loading&&<div style={{padding:32,textAlign:'center',color:T.textSec,fontSize:13}}>A carregar…</div>}
          {!loading&&notifs.length===0&&(
            <div style={{padding:48,textAlign:'center'}}>
              <Bell size={32} color={T.textTer} style={{marginBottom:12}}/>
              <div style={{fontSize:13,color:T.textSec}}>Sem notificações por enquanto.</div>
              <div style={{fontSize:11,color:T.textTer,marginTop:4}}>Os imports automáticos e manuais aparecem aqui.</div>
            </div>
          )}
          {!loading&&notifs.map((n,i)=>{
            const isExp = expanded===n.id
            const meta = n.meta ?? {}
            return (
              <div key={n.id} style={{background:T.surface,borderRadius:12,marginBottom:10,overflow:'hidden',border:`1px solid ${T.border}`}}>
                <div onClick={()=>setExpanded(isExp?null:n.id)} style={{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 14px',cursor:'pointer'}}>
                  <div style={{fontSize:20,lineHeight:1,flexShrink:0,marginTop:2}}>{typeIcon(n.type)}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:typeColor(n.type,pal),marginBottom:2}}>{n.title}</div>
                    {n.body&&<div style={{fontSize:11,color:T.textSec,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n.body.split(' | ')[0]}{n.body.includes(' | ')&&' …'}</div>}
                    <div style={{fontSize:10,color:T.textTer,marginTop:4}}>{fmt(n.created_at)}</div>
                  </div>
                  <button onClick={e=>{e.stopPropagation();del(n.id)}} style={{background:'none',border:'none',cursor:'pointer',padding:2,flexShrink:0}}>
                    <X size={14} color={T.textTer}/>
                  </button>
                </div>
                {isExp&&(
                  <div style={{padding:'0 14px 12px 46px',borderTop:`1px solid ${T.border}`}}>
                    {meta.account_id&&<div style={{fontSize:11,color:T.textSec,marginTop:8}}>🏦 Conta: {meta.account_id}</div>}
                    {meta.filename&&<div style={{fontSize:11,color:T.textSec,marginTop:4}}>📄 {meta.filename}</div>}
                    {meta.txn_count!=null&&<div style={{fontSize:11,color:T.textSec,marginTop:4}}>📊 {meta.txn_count} transações</div>}
                    {meta.total_rec!=null&&meta.total_rec>0&&<div style={{fontSize:11,color:T.green,marginTop:4}}>↑ Receitas: {dec(meta.total_rec)}</div>}
                    {meta.total_desp!=null&&meta.total_desp>0&&<div style={{fontSize:11,color:T.red,marginTop:4}}>↓ Despesas: {dec(meta.total_desp)}</div>}
                    {meta.files_imported!=null&&<div style={{fontSize:11,color:T.textSec,marginTop:4}}>✅ {meta.files_imported} ficheiros importados · ⚠ {meta.files_failed??0} erros</div>}
                    {meta.errors&&Array.isArray(meta.errors)&&meta.errors.length>0&&(
                      <div style={{marginTop:8,background:'rgba(248,113,113,0.08)',borderRadius:8,padding:'8px 10px'}}>
                        {meta.errors.map((e:string,i:number)=><div key={i} style={{fontSize:10,color:T.red,marginBottom:2}}>{e}</div>)}
                      </div>
                    )}
                    {n.body&&n.body.includes(' | ')&&(
                      <div style={{marginTop:8,background:T.surface2,borderRadius:8,padding:'8px 10px'}}>
                        {n.body.split(' | ').map((line:string,i:number)=>(
                          <div key={i} style={{fontSize:10,color:line.startsWith('✗')?T.red:T.textSec,marginBottom:2,wordBreak:'break-word'}}>{line}</div>
                        ))}
                      </div>
                    )}
                    {meta.duration_sec&&<div style={{fontSize:10,color:T.textTer,marginTop:6}}>⏱ {meta.duration_sec}s</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal cron trigger com feedback */}
      {showCronModal&&(
        <div onClick={()=>cronState!=='running'&&setShowCronModal(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:120,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 16px'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:16,width:'100%',maxWidth:380,padding:'24px 20px'}}>
            {cronState==='idle'&&(
              <>
                <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Executar cron manualmente</div>
                <div style={{fontSize:12,color:T.textSec,marginBottom:16,lineHeight:1.5}}>Introduz o CRON_SECRET (está nas variáveis de ambiente do Vercel).</div>
                <input
                  type="password"
                  placeholder="CRON_SECRET"
                  value={cronSecret}
                  onChange={e=>setCronSecret(e.target.value)}
                  onKeyDown={async e=>{
                    if(e.key==='Enter' && cronSecret){
                      setCronState('running')
                      const res = await fetch('/api/cron/trigger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:cronSecret})})
                      const data = await res.json()
                      setCronResult(data)
                      setCronState(data.ok?'done':'error')
                      if(data.ok) await load()
                    }
                  }}
                  style={{width:'100%',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px',color:T.text,fontSize:13,outline:'none',boxSizing:'border-box',marginBottom:12}}
                  autoFocus
                />
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setShowCronModal(false)} style={{flex:1,background:T.surface2,border:'none',borderRadius:10,padding:'10px',color:T.textSec,fontSize:13,cursor:'pointer'}}>Cancelar</button>
                  <button onClick={async()=>{
                    if(!cronSecret) return
                    setCronState('running')
                    const res = await fetch('/api/cron/trigger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:cronSecret})})
                    const data = await res.json()
                    setCronResult(data)
                    setCronState(data.ok?'done':'error')
                    if(data.ok) await load()
                  }} style={{flex:2,background:pal.accent,border:'none',borderRadius:10,padding:'10px',color:'#0B0B12',fontSize:13,fontWeight:700,cursor:'pointer',opacity:cronSecret?1:0.4}}>Executar</button>
                </div>
              </>
            )}
            {cronState==='running'&&(
              <div style={{textAlign:'center',padding:'8px 0'}}>
                <RefreshCw size={28} color={pal.accent} style={{marginBottom:12,animation:'spin 1s linear infinite'}}/>
                <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:6}}>Cron a executar…</div>
                <div style={{fontSize:12,color:T.textSec,lineHeight:1.5}}>A verificar Drive, T212 e Enable Banking.<br/>Pode demorar 30–60 segundos.</div>
              </div>
            )}
            {(cronState==='done'||cronState==='error')&&(
              <div>
                <div style={{fontSize:14,fontWeight:700,color:cronState==='done'?T.green:T.red,marginBottom:10}}>
                  {cronState==='done'?'✓ Cron executado com sucesso':'✗ Erro ao executar cron'}
                </div>
                {cronResult&&(
                  <div style={{background:T.surface2,borderRadius:10,padding:'10px 12px',marginBottom:14,fontSize:11,color:T.textSec,maxHeight:200,overflowY:'auto'}}>
                    {cronState==='done'?(
                      <>
                        <div style={{marginBottom:4}}>⏱ {cronResult.duration_sec}s</div>
                        {cronResult.files_imported!=null&&<div>📂 Drive: {cronResult.files_imported} ficheiros importados</div>}
                        {cronResult.files_failed>0&&<div style={{color:T.red}}>⚠ {cronResult.files_failed} ficheiros falhados</div>}
                      </>
                    ):(
                      <div style={{color:T.red}}>{cronResult.error}</div>
                    )}
                  </div>
                )}
                <button onClick={async()=>{
                  setShowCronModal(false)
                  setCronSecret('')
                  setCronState('idle')
                  await load()
                }} style={{width:'100%',background:pal.accent,border:'none',borderRadius:10,padding:'10px',color:'#0B0B12',fontSize:13,fontWeight:700,cursor:'pointer'}}>
                  Fechar e actualizar notificações
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────
// DRIVE FOLDER PICKER — navega pastas da Drive para associar a uma conta
// ─────────────────────────────────────────────────────────────────
const DriveFolderPicker = ({account,onClose,onSaved,pal}:{account:Account,onClose:()=>void,onSaved:()=>void,pal:{accent:string,soft:string}}) => {
  const [path,setPath] = useState<{id:string,name:string}[]>([{id:'root',name:'Meu Drive'}])
  const [folders,setFolders] = useState<{id:string,name:string}[]>([])
  const [selected,setSelected] = useState<{id:string,name:string}|null>(null)
  const [fileCount,setFileCount] = useState<number|null>(null)
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)

  const currentFolder = path[path.length-1]

  const loadFolders = useCallback(async(parentId:string)=>{
    setLoading(true)
    const { data:{user} } = await supabase.auth.getUser()
    if(!user) return
    const res = await fetch(`/api/drive/folders?user_id=${user.id}&parent=${parentId}`)
    const data = await res.json()
    setFolders(data.folders ?? [])
    setLoading(false)
  },[])

  const checkFileCount = useCallback(async(folderId:string)=>{
    const { data:{user} } = await supabase.auth.getUser()
    if(!user) return
    const res = await fetch(`/api/drive/files?user_id=${user.id}&folder_id=${folderId}`)
    const data = await res.json()
    setFileCount((data.files ?? []).length)
  },[])

  useEffect(()=>{ loadFolders(currentFolder.id) },[currentFolder.id, loadFolders])
  useEffect(()=>{ if(selected) checkFileCount(selected.id) },[selected, checkFileCount])

  const enterFolder = (f:{id:string,name:string}) => {
    setPath([...path,f]); setSelected(null); setFileCount(null)
  }
  const goBackTo = (idx:number) => {
    setPath(path.slice(0,idx+1)); setSelected(null); setFileCount(null)
  }

  const confirm = async () => {
    if(!selected) return
    setSaving(true)
    await updateAccountDriveFolder(account.id, selected.id, [...path.slice(1).map(p=>p.name),selected.name].join('/'))
    await onSaved(); setSaving(false); onClose()
  }

  return (
    <div onClick={e=>{e.stopPropagation();onClose()}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:120,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:'20px 20px 0 0',width:'100%',maxWidth:440,maxHeight:'88vh',display:'flex',flexDirection:'column',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'}}>
        <div style={{display:'flex',alignItems:'center',padding:'16px 18px',borderBottom:`1px solid ${T.border}`}}>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,color:T.text}}>Escolher pasta</div>
            <div style={{fontSize:11,color:T.textSec}}>{account.nome}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer'}}><X size={18} color={T.textSec}/></button>
        </div>
        <div style={{padding:'14px 18px 0'}}>
          <div style={{fontSize:11,color:T.textSec,marginBottom:12,lineHeight:1.5}}>
            A app vai ler os PDFs desta pasta automaticamente. Não cria nem altera ficheiros — apenas leitura.
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4,fontSize:11,color:T.textTer,marginBottom:8}}>
            {path.map((p,i)=>(
              <span key={p.id} onClick={()=>goBackTo(i)} style={{cursor:'pointer',color:i===path.length-1?pal.accent:T.textTer,fontWeight:i===path.length-1?600:400}}>
                {p.name}{i<path.length-1?' / ':''}
              </span>
            ))}
          </div>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'0 18px'}}>
          <Card style={{marginBottom:14}}>
            {loading&&<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>A carregar pastas…</div>}
            {!loading&&folders.length===0&&<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem subpastas aqui.</div>}
            {!loading&&folders.map((f,i)=>{
              const isSel = selected?.id===f.id
              return (
                <div key={f.id} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderBottom:i<folders.length-1?`1px solid ${T.border}`:'none',background:isSel?pal.soft:'transparent',borderLeft:isSel?`3px solid ${pal.accent}`:'3px solid transparent'}}>
                  <div onClick={()=>setSelected(isSel?null:f)} style={{display:'flex',alignItems:'center',gap:10,flex:1,cursor:'pointer'}}>
                    <Folder size={16} color={isSel?pal.accent:T.textSec}/>
                    <span style={{fontSize:13,color:isSel?pal.accent:T.text,fontWeight:isSel?700:400,flex:1}}>{f.name}</span>
                    {isSel&&<Check size={14} color={pal.accent}/>}
                  </div>
                  <button onClick={()=>enterFolder(f)} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ChevronRight size={14} color={T.textTer}/></button>
                </div>
              )
            })}
          </Card>
          {selected&&fileCount!==null&&(
            <Card style={{background:pal.soft,padding:'10px 12px',marginBottom:14}}>
              <div style={{fontSize:11,color:T.green,fontWeight:600}}>✓ {fileCount} ficheiro{fileCount!==1?'s':''} encontrado{fileCount!==1?'s':''} nesta pasta</div>
            </Card>
          )}
        </div>
        <div style={{flexShrink:0,padding:'12px 18px 20px',borderTop:`1px solid ${T.border}`}}>
          <Btn onClick={confirm} variant="primary" accent={pal.accent} style={{width:'100%',opacity:selected?1:0.4}}>{saving?'A guardar…':'Confirmar pasta'}</Btn>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// DRIVE FILE SELECT — escolhe quais ficheiros da pasta importar agora
// (1ª ligação + "puxar mais histórico" reutilizam este mesmo ecrã)
// ─────────────────────────────────────────────────────────────────
type DriveFolderFile = { id:string; name:string; mimeType:string; modifiedTime:string }
type DrivePreviewTxn = { uid:string; fileId:string; fileName:string; data:string; descritivo:string; valor:number; categoria:string; keep:boolean }
type DrivePreviewMeta = { saldo_final:number|null; iban:string|null; numero_conta:string|null; periodo_fim:string|null }

const DriveFileSelectScreen = ({account,onClose,onRefresh,pal}:{account:Account,onClose:()=>void,onRefresh:()=>void,pal:{accent:string,soft:string}}) => {
  const [loading,setLoading] = useState(true)
  const [files,setFiles] = useState<DriveFolderFile[]>([])
  const [importedIds,setImportedIds] = useState<Set<string>>(new Set())
  const [selected,setSelected] = useState<Set<string>>(new Set())
  const [selectedForReimport,setSelectedForReimport] = useState<Set<string>>(new Set())
  const [reimportMode,setReimportMode] = useState(false)

  // Estado do preview (passo intermédio antes de gravar)
  const [previewing,setPreviewing] = useState(false)
  const [previewProgress,setPreviewProgress] = useState({done:0,total:0,filename:''})
  const [previewTxns,setPreviewTxns] = useState<DrivePreviewTxn[]>([])
  const [previewMetaByFile,setPreviewMetaByFile] = useState<Record<string,DrivePreviewMeta>>({})
  const [previewErrors,setPreviewErrors] = useState<{filename:string,error:string}[]>([])

  // Estado da gravação final
  const [saving,setSaving] = useState(false)
  const [results,setResults] = useState<{filename:string,ok:boolean,txns?:number,error?:string}[]>([])

  const load = useCallback(async()=>{
    setLoading(true)
    const { data:{user} } = await supabase.auth.getUser()
    if(!user || !account.drive_folder_id) { setLoading(false); return }
    const [folderFiles, driveFiles] = await Promise.all([
      listDriveFolderFiles(user.id, account.drive_folder_id),
      loadDriveFiles(account.id),
    ])
    setFiles(folderFiles)
    setImportedIds(new Set(driveFiles.filter(f=>f.status==='importado').map(f=>f.google_file_id)))
    setLoading(false)
  },[account])

  useEffect(()=>{ load() },[load])

  const toggle = (id:string) => {
    if(importedIds.has(id)) return
    const n = new Set(selected)
    n.has(id) ? n.delete(id) : n.add(id)
    setSelected(n)
  }

  const toggleReimport = (id:string) => {
    const n = new Set(selectedForReimport)
    n.has(id) ? n.delete(id) : n.add(id)
    setSelectedForReimport(n)
  }

  const reimport = async (id:string) => {
    if(!confirm('Marcar este ficheiro para reimportar? As transações já guardadas não são apagadas automaticamente — se importaste por engano, apaga-as primeiro em "Ver todas".')) return
    await resetDriveFileImport(account.id, id)
    await load()
  }

  const reimportSelected = async () => {
    if(selectedForReimport.size===0) return
    if(!confirm(`Marcar ${selectedForReimport.size} ficheiro${selectedForReimport.size>1?'s':''} para reimportar? As transações já guardadas não são apagadas — apaga-as primeiro em "Ver todas" se necessário.`)) return
    await Promise.all(Array.from(selectedForReimport).map(id=>resetDriveFileImport(account.id, id)))
    setSelectedForReimport(new Set())
    setReimportMode(false)
    await load()
  }

  // Passo 1→2: lê e processa os ficheiros seleccionados, mas NÃO grava nada ainda
  const startPreview = async () => {
    const { data:{user} } = await supabase.auth.getUser()
    if(!user) return
    const toPreview = files.filter(f=>selected.has(f.id))
    setPreviewing(true)
    setPreviewProgress({done:0,total:toPreview.length,filename:''})

    const allTxns:DrivePreviewTxn[] = []
    const metaByFile:Record<string,DrivePreviewMeta> = {}
    const errors:{filename:string,error:string}[] = []
    let uidCounter = 0

    for(const f of toPreview){
      setPreviewProgress(p=>({...p,filename:f.name}))
      const result = await previewDriveFile({userId:user.id, googleFileId:f.id, filename:f.name})
      if(result.error){
        errors.push({filename:f.name, error:result.error})
      } else {
        metaByFile[f.id] = result.meta
        for(const t of result.transactions ?? []){
          allTxns.push({uid:`${f.id}-${uidCounter++}`, fileId:f.id, fileName:f.name, data:t.data, descritivo:t.descritivo, valor:t.valor, categoria:t.categoria, keep:true})
        }
      }
      setPreviewProgress(p=>({...p,done:p.done+1}))
    }

    setPreviewTxns(allTxns)
    setPreviewMetaByFile(metaByFile)
    setPreviewErrors(errors)
    setPreviewing(false)
  }

  const togglePreviewTxn = (uid:string) => setPreviewTxns(p=>p.map(t=>t.uid===uid?{...t,keep:!t.keep}:t))
  const setPreviewCategoria = (uid:string,cat:string) => setPreviewTxns(p=>p.map(t=>t.uid===uid?{...t,categoria:cat}:t))

  // Passo 2→3: grava o que foi confirmado, agrupado por ficheiro
  const confirmAndSave = async () => {
    const { data:{user} } = await supabase.auth.getUser()
    if(!user) return
    setSaving(true)
    const res:{filename:string,ok:boolean,txns?:number,error?:string}[] = []

    const fileIds = Array.from(new Set(previewTxns.map(t=>t.fileId)))
    for(const fileId of fileIds){
      const file = files.find(f=>f.id===fileId)
      if(!file) continue
      const txnsForFile = previewTxns.filter(t=>t.fileId===fileId && t.keep)
        .map(t=>({data:t.data, descritivo:t.descritivo, valor:t.valor, categoria:t.categoria}))
      const meta = previewMetaByFile[fileId] ?? {saldo_final:null,iban:null,numero_conta:null,periodo_fim:null}
      const result = await importDriveFile({userId:user.id, accountId:account.id, googleFileId:fileId, filename:file.name, triggerType:'manual', transactions:txnsForFile, meta})
      if(result.ok) res.push({filename:file.name, ok:true, txns:result.transactions_count})
      else res.push({filename:file.name, ok:false, error:result.error})
    }
    // Ficheiros que falharam no preview também ficam reportados
    for(const e of previewErrors) res.push({filename:e.filename, ok:false, error:e.error})

    setResults(res)
    setSaving(false)
    await onRefresh()
  }

  const cancelPreview = () => {
    setPreviewTxns([]); setPreviewMetaByFile({}); setPreviewErrors([])
  }

  const jaImportados = files.filter(f=>importedIds.has(f.id)).length
  const showingPreview = previewTxns.length>0 || previewErrors.length>0
  const toSaveCount = previewTxns.filter(t=>t.keep).length
  const totalRec = previewTxns.filter(t=>t.keep&&t.valor>0).reduce((s,t)=>s+t.valor,0)
  const totalDesp = previewTxns.filter(t=>t.keep&&t.valor<0).reduce((s,t)=>s+Math.abs(t.valor),0)

  return (
    <div onClick={e=>e.stopPropagation()} style={{position:'fixed',inset:0,background:T.bg,zIndex:95,overflowY:'auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <div style={{maxWidth:440,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:T.surface,borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,zIndex:10}}>
          <button onClick={()=>showingPreview&&!saving&&results.length===0?cancelPreview():onClose()} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ArrowLeft size={18} color={T.textSec}/></button>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:700,color:T.text}}>{account.nome}</div>
            <div style={{fontSize:11,color:T.textSec}}>📂 {account.drive_folder_name}</div>
          </div>
        </div>

        <div style={{padding:'16px 14px',paddingBottom:100}}>

          {/* RESULTADO FINAL */}
          {results.length>0&&(
            <Card style={{marginBottom:16,padding:'14px'}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:10}}>✓ Importação concluída</div>
              {results.map((r,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:i<results.length-1?`1px solid ${T.border}`:'none'}}>
                  <span style={{fontSize:12,color:T.text,flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.filename}</span>
                  {r.ok?<span style={{fontSize:11,color:T.green,fontWeight:600}}>{r.txns} transações</span>:<span style={{fontSize:11,color:T.red}}>{r.error}</span>}
                </div>
              ))}
              <Btn onClick={onClose} variant="primary" accent={pal.accent} style={{width:'100%',marginTop:14}}>Concluído</Btn>
            </Card>
          )}

          {/* A LER FICHEIROS (preview) */}
          {previewing&&(
            <Card style={{marginBottom:16,padding:'20px',textAlign:'center'}}>
              <RefreshCw size={24} color={pal.accent} style={{marginBottom:10}}/>
              <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:4}}>A ler ficheiro {previewProgress.done+1} de {previewProgress.total}…</div>
              <div style={{fontSize:11,color:T.textTer,marginBottom:8}}>{previewProgress.filename}</div>
              <div style={{height:4,background:T.border,borderRadius:2,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${previewProgress.total?previewProgress.done/previewProgress.total*100:0}%`,background:pal.accent,transition:'width 0.3s'}}/>
              </div>
            </Card>
          )}

          {/* A GRAVAR (depois de confirmares) */}
          {saving&&(
            <Card style={{marginBottom:16,padding:'20px',textAlign:'center'}}>
              <RefreshCw size={24} color={pal.accent} style={{marginBottom:10}}/>
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>A guardar transações…</div>
            </Card>
          )}

          {/* PREVIEW — revê e confirma antes de gravar */}
          {!previewing&&!saving&&results.length===0&&showingPreview&&(
            <div>
              <div style={{display:'flex',gap:8,marginBottom:14}}>
                <div style={{flex:1,background:pal.soft,borderRadius:10,padding:'10px 12px',textAlign:'center'}}>
                  <div style={{fontSize:11,color:T.textSec,marginBottom:2}}>A importar</div>
                  <div style={{fontSize:16,fontWeight:700,color:T.text}}>{toSaveCount}/{previewTxns.length}</div>
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

              {previewErrors.length>0&&(
                <Card style={{marginBottom:14,padding:'10px 14px'}}>
                  <div style={{fontSize:11,fontWeight:600,color:T.red,marginBottom:4}}>⚠ {previewErrors.length} ficheiro(s) com erro</div>
                  {previewErrors.map((e,i)=>(<div key={i} style={{fontSize:11,color:T.textSec}}>{e.filename}: {e.error}</div>))}
                </Card>
              )}

              <div style={{fontSize:11,color:T.textTer,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>Transações encontradas</div>
              <Card>
                {previewTxns.map((t,i)=>(
                  <div key={t.uid} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderBottom:i<previewTxns.length-1?`1px solid ${T.border}`:'none',opacity:t.keep?1:0.4}}>
                    <div onClick={()=>togglePreviewTxn(t.uid)} style={{flexShrink:0,cursor:'pointer'}}>
                      {t.keep?<CheckSquare size={18} color={pal.accent}/>:<Square size={18} color={T.textTer}/>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:500,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.descritivo}</div>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3}}>
                        <span style={{fontSize:10,color:T.textTer}}>{t.data}</span>
                        <select value={t.categoria} onChange={e=>setPreviewCategoria(t.uid,e.target.value)}
                          style={{fontSize:10,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:'1px 4px',color:T.textSec,outline:'none',cursor:'pointer'}}>
                          {(t.valor>=0 ? ['Receita'] : CAT_LIST.filter(c=>c!=='Receita')).map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{fontSize:13,fontWeight:700,color:t.valor>=0?T.green:T.red,fontFamily:T.mono,whiteSpace:'nowrap',flexShrink:0}}>{t.valor>=0?'+ ':'− '}{dec(t.valor)}</div>
                  </div>
                ))}
                {!previewTxns.length&&<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Nenhuma transação encontrada nos ficheiros seleccionados.</div>}
              </Card>
            </div>
          )}

          {/* SELECÇÃO DE FICHEIROS (estado inicial) */}
          {!previewing&&!saving&&results.length===0&&!showingPreview&&(
            <>
              {loading&&<div style={{padding:32,textAlign:'center',color:T.textSec,fontSize:13}}>A carregar ficheiros…</div>}
              {!loading&&(
                <>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                    <div style={{fontSize:12,color:T.textSec}}>{files.length} ficheiros nesta pasta · {jaImportados} já importados</div>
                    {jaImportados>0&&(
                      <button onClick={()=>{setReimportMode(m=>!m);setSelectedForReimport(new Set())}} style={{background:reimportMode?pal.soft:'none',border:`1px solid ${reimportMode?pal.accent:T.border}`,borderRadius:8,padding:'4px 10px',fontSize:11,fontWeight:600,color:reimportMode?pal.accent:T.textSec,cursor:'pointer'}}>
                        {reimportMode?'Cancelar':'↺ Reimport'}
                      </button>
                    )}
                  </div>
                  <Card>
                    {files.map((f,i)=>{
                      const isDone = importedIds.has(f.id)
                      const isSel = selected.has(f.id)
                      const isSelReimport = selectedForReimport.has(f.id)
                      return (
                        <div key={f.id} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderBottom:i<files.length-1?`1px solid ${T.border}`:'none',background:isSel||isSelReimport?pal.soft:'transparent'}}>
                          {/* Modo reimport: checkbox nos já importados; modo normal: checkbox nos por importar */}
                          {reimportMode && isDone ? (
                            <div onClick={()=>toggleReimport(f.id)} style={{cursor:'pointer',flexShrink:0}}>
                              {isSelReimport?<CheckSquare size={16} color={pal.accent}/>:<Square size={16} color={T.textTer}/>}
                            </div>
                          ) : (
                            <div onClick={()=>toggle(f.id)} style={{flexShrink:0,cursor:isDone||reimportMode?'default':'pointer',opacity:isDone&&!reimportMode?0.55:1}}>
                              {isDone&&!reimportMode?<Check size={16} color={T.green}/>:(isSel?<CheckSquare size={16} color={pal.accent}/>:<Square size={16} color={T.textTer}/>)}
                            </div>
                          )}
                          <div style={{display:'flex',alignItems:'center',gap:10,flex:1,minWidth:0}}>
                            <FileText size={14} color={T.textSec}/>
                            <span style={{fontSize:12,color:T.text,flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{f.name}</span>
                          </div>
                          {isDone&&!reimportMode&&(
                            <button onClick={()=>reimport(f.id)} style={{display:'flex',alignItems:'center',gap:3,background:'none',border:'none',cursor:'pointer',padding:'2px 4px',flexShrink:0}}>
                              <RefreshCw size={11} color={T.textTer}/>
                              <span style={{fontSize:10,color:T.textTer,fontWeight:600}}>1</span>
                            </button>
                          )}
                          {!isDone&&!reimportMode&&<span style={{fontSize:10,color:T.textTer,fontWeight:600,flexShrink:0}}>por importar</span>}
                        </div>
                      )
                    })}
                    {!files.length&&<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem ficheiros compatíveis nesta pasta.</div>}
                  </Card>
                  <div style={{marginTop:14,fontSize:11,color:T.textTer,lineHeight:1.6}}>💡 Não precisas de importar tudo de uma vez. Selecciona alguns meses agora e volta mais tarde para puxar mais histórico.</div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Botão fixo no fundo — muda consoante o passo */}
      {!previewing&&!saving&&results.length===0&&!showingPreview&&(
        <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:440,background:T.surface,borderTop:`1px solid ${T.border}`,padding:'12px 16px 20px'}}>
          {reimportMode ? (
            <Btn onClick={reimportSelected} variant="primary" accent={pal.accent} style={{width:'100%',opacity:selectedForReimport.size?1:0.4}}>
              {selectedForReimport.size?`↺ Reimportar ${selectedForReimport.size} ficheiro${selectedForReimport.size>1?'s':''}`:'Selecciona ficheiros para reimportar'}
            </Btn>
          ) : (
            <Btn onClick={startPreview} variant="primary" accent={pal.accent} style={{width:'100%',opacity:selected.size?1:0.4}}>{selected.size?`Ler ${selected.size} ficheiro${selected.size>1?'s':''} →`:'Selecciona ficheiros para importar'}</Btn>
          )}
        </div>
      )}
      {!previewing&&!saving&&results.length===0&&showingPreview&&(
        <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:440,background:T.surface,borderTop:`1px solid ${T.border}`,padding:'12px 16px 20px',display:'flex',gap:10}}>
          <Btn onClick={cancelPreview} variant="ghost" accent={pal.accent} style={{flex:1}}>← Voltar</Btn>
          <Btn onClick={confirmAndSave} variant="primary" accent={pal.accent} style={{flex:2,opacity:toSaveCount?1:0.4}}>{toSaveCount?`✓ Importar ${toSaveCount} transações`:'Sem transações seleccionadas'}</Btn>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// DRIVE SETTINGS SCREEN
// ─────────────────────────────────────────────────────────────────
const DriveSettingsScreen = ({onClose,accounts,onRefresh,pal}:{onClose:()=>void,accounts:Account[],onRefresh:()=>void,pal:{accent:string,soft:string}}) => {
  const [status,setStatus] = useState<DriveToken|null|undefined>(undefined)
  const [pickerAccount,setPickerAccount] = useState<Account|null>(null)
  const [fileSelectAccount,setFileSelectAccount] = useState<Account|null>(null)
  const [connecting,setConnecting] = useState(false)
  const [checking,setChecking] = useState(false)
  const [checkProgress,setCheckProgress] = useState({done:0,total:0,filename:''})
  const [checkResult,setCheckResult] = useState<{contasComNovidades:number,contas:number}|null>(null)
  // Fila de contas com ficheiros novos por rever — uma de cada vez, sequencialmente
  const [reviewQueue,setReviewQueue] = useState<Account[]>([])

  const load = useCallback(async()=>{ const s = await getDriveConnectionStatus(); setStatus(s) },[])
  useEffect(()=>{ load() },[load])

  const connect = async () => {
    setConnecting(true)
    const url = await getDriveAuthUrl()
    if(url) window.location.href = url
  }
  const disconnect = async () => {
    if(!confirm('Desligar o Google Drive? As pastas associadas às contas mantêm-se guardadas.')) return
    await disconnectDrive(); await load()
  }

  // "Verificar agora": para cada conta com pasta associada, lista ficheiros da Drive,
  // identifica os que ainda não foram vistos (não existem em drive_files), e importa-os
  // automaticamente — sem selecção manual, ao contrário do fluxo de "puxar histórico".
  // "Verificar agora": detecta, por conta, se há ficheiros novos na pasta Drive.
  // NÃO importa automaticamente — em vez disso, enfileira as contas com novidades
  // para revisão sequencial (uma de cada vez), reaproveitando o ecrã de preview.
  const checkNow = async () => {
    const { data:{user} } = await supabase.auth.getUser()
    if(!user) return
    const linkedAccounts = accounts.filter(a=>a.drive_folder_id)
    if(!linkedAccounts.length) return

    setChecking(true)
    setCheckResult(null)
    setCheckProgress({done:0,total:linkedAccounts.length,filename:''})
    const accountsWithNews:Account[] = []

    for(const acc of linkedAccounts){
      setCheckProgress(p=>({...p,filename:acc.nome}))
      const [folderFiles, driveFiles] = await Promise.all([
        listDriveFolderFiles(user.id, acc.drive_folder_id!),
        loadDriveFiles(acc.id),
      ])
      const knownIds = new Set(driveFiles.map(f=>f.google_file_id))
      const hasNew = folderFiles.some(f=>!knownIds.has(f.id))
      if(hasNew) accountsWithNews.push(acc)
      setCheckProgress(p=>({...p,done:p.done+1}))
    }

    setCheckResult({contasComNovidades:accountsWithNews.length, contas:linkedAccounts.length})
    setChecking(false)
    if(accountsWithNews.length>0){
      setReviewQueue(accountsWithNews)
    }
  }

  // Quando uma conta da fila termina a revisão (ou é fechada), avança para a próxima
  const advanceQueue = async () => {
    await onRefresh()
    setReviewQueue(q=>q.slice(1))
  }

  return (
    <div style={{position:'fixed',inset:0,background:T.bg,zIndex:90,overflowY:'auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <div style={{maxWidth:440,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:T.surface,borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,zIndex:10}}>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ArrowLeft size={18} color={T.textSec}/></button>
          <div style={{fontSize:16,fontWeight:700,color:T.text,flex:1}}>Google Drive</div>
        </div>
        <div style={{padding:'16px 14px'}}>
          {status===undefined&&<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>A verificar ligação…</div>}

          {status===null&&(
            <Card style={{padding:16,marginBottom:16,textAlign:'center'}}>
              <HardDrive size={28} color={T.textSec} style={{marginBottom:10}}/>
              <div style={{fontSize:13,color:T.text,fontWeight:600,marginBottom:6}}>Drive não ligada</div>
              <div style={{fontSize:11,color:T.textSec,marginBottom:14,lineHeight:1.5}}>Liga a tua Google Drive para importares extractos automaticamente das pastas que escolheres.</div>
              <Btn onClick={connect} variant="primary" accent={pal.accent} style={{width:'100%'}}>{connecting?'A ligar…':'Ligar Google Drive'}</Btn>
            </Card>
          )}

          {status&&(
            <>
              <Card style={{padding:14,marginBottom:16,display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:40,height:40,borderRadius:10,background:'rgba(74,222,128,0.12)',display:'flex',alignItems:'center',justifyContent:'center'}}><Check size={18} color={T.green}/></div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:T.text}}>Ligado</div>
                  <div style={{fontSize:11,color:T.textSec}}>{status.account_email ?? 'conta Google'} · só leitura</div>
                </div>
                <span onClick={disconnect} style={{fontSize:11,color:T.red,cursor:'pointer'}}>Desligar</span>
              </Card>

              <div style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase',marginBottom:8}}>Verificação</div>
              <Card style={{padding:14,marginBottom:16}}>
                {!checking&&!checkResult&&(
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:13,color:T.text,fontWeight:600}}>Manual</div>
                      <div style={{fontSize:11,color:T.textSec,marginTop:2}}>Verifica pastas associadas por ficheiros novos</div>
                    </div>
                    <button onClick={checkNow} disabled={!accounts.some(a=>a.drive_folder_id)} style={{background:accounts.some(a=>a.drive_folder_id)?pal.accent:T.surface2,color:accounts.some(a=>a.drive_folder_id)?'#0B0B12':T.textTer,border:'none',borderRadius:8,padding:'8px 12px',fontSize:11,fontWeight:700,cursor:accounts.some(a=>a.drive_folder_id)?'pointer':'default',display:'flex',alignItems:'center',gap:5}}>
                      <RefreshCw size={12}/> Verificar agora
                    </button>
                  </div>
                )}
                {checking&&(
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:4}}>A verificar pastas…</div>
                    <div style={{fontSize:11,color:T.textSec,marginBottom:8}}>{checkProgress.total>0?`${checkProgress.done} de ${checkProgress.total} ficheiros novos`:'A procurar ficheiros novos…'}</div>
                    {checkProgress.filename&&<div style={{fontSize:11,color:T.textTer,marginBottom:8}}>{checkProgress.filename}</div>}
                    {checkProgress.total>0&&<div style={{height:4,background:T.border,borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',width:`${checkProgress.done/checkProgress.total*100}%`,background:pal.accent,transition:'width 0.3s'}}/></div>}
                  </div>
                )}
                {checkResult&&!checking&&reviewQueue.length===0&&(
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:T.green,marginBottom:4}}>✓ Verificação concluída</div>
                    <div style={{fontSize:11,color:T.textSec}}>{checkResult.contasComNovidades>0?`${checkResult.contasComNovidades} conta(s) com ficheiros novos`:'Nenhum ficheiro novo encontrado'} · {checkResult.contas} contas verificadas</div>
                    <button onClick={()=>setCheckResult(null)} style={{marginTop:10,background:'none',border:'none',color:pal.accent,fontSize:11,fontWeight:600,cursor:'pointer',padding:0}}>Fechar</button>
                  </div>
                )}
              </Card>
              {reviewQueue.length>0&&(
                <Card style={{background:pal.soft,padding:'10px 14px',marginBottom:16}}>
                  <div style={{fontSize:12,color:pal.accent,fontWeight:600}}>📋 {reviewQueue.length} conta(s) por rever — a mostrar "{reviewQueue[0].nome}"</div>
                </Card>
              )}

              <div style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase',marginBottom:8}}>Pastas associadas</div>
              <Card>
                {accounts.map((a,i)=>(
                  <div key={a.id} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderBottom:i<accounts.length-1?`1px solid ${T.border}`:'none'}}>
                    <div onClick={()=>a.drive_folder_id?setFileSelectAccount(a):setPickerAccount(a)} style={{display:'flex',alignItems:'center',gap:10,flex:1,cursor:'pointer',minWidth:0}}>
                      <div style={{width:30,height:30,borderRadius:8,background:T.surface2,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Folder size={14} color={a.drive_folder_id?pal.accent:T.textTer}/></div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,color:T.text,fontWeight:600}}>{a.nome}</div>
                        {a.drive_folder_id?<div style={{fontSize:10,color:T.green,marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>📂 {a.drive_folder_name}</div>:<div style={{fontSize:10,color:'#FBBF24',marginTop:1}}>⚠ Sem pasta associada</div>}
                      </div>
                    </div>
                    {a.drive_folder_id?(
                      <span onClick={()=>setPickerAccount(a)} style={{fontSize:11,color:T.textSec,cursor:'pointer',flexShrink:0}}>Alterar</span>
                    ):(
                      <span onClick={()=>setPickerAccount(a)} style={{fontSize:11,color:pal.accent,fontWeight:600,cursor:'pointer',flexShrink:0}}>Associar</span>
                    )}
                  </div>
                ))}
                {!accounts.length&&<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem contas configuradas.</div>}
              </Card>

              <div style={{marginTop:16,fontSize:11,color:T.textTer,lineHeight:1.6,padding:'0 4px'}}>
                ℹ️ A pasta de cada conta também pode ser configurada directamente no ecrã de editar conta.
              </div>
            </>
          )}
        </div>
      </div>
      {pickerAccount&&<DriveFolderPicker account={pickerAccount} onClose={()=>setPickerAccount(null)} onSaved={onRefresh} pal={pal}/>}
      {fileSelectAccount&&<DriveFileSelectScreen account={fileSelectAccount} onClose={()=>setFileSelectAccount(null)} onRefresh={onRefresh} pal={pal}/>}
      {reviewQueue.length>0&&<DriveFileSelectScreen account={reviewQueue[0]} onClose={advanceQueue} onRefresh={advanceQueue} pal={pal}/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────
const SettingsPanel = ({onClose,accounts,onRefresh,pal,me,onMembers,onShowInvites,pendingInvitesCount,onProfileUpdated}:{onClose:()=>void,accounts:Account[],onRefresh:()=>void,pal:{accent:string,soft:string},me:Profile|null,onMembers:(accountId:string)=>void,onShowInvites:()=>void,pendingInvitesCount:number,onProfileUpdated:()=>void}) => {
  const [formOpen,setFormOpen] = useState(false)
  const [editing,setEditing] = useState<Account|null>(null)
  const [showRules,setShowRules] = useState(false)
  const [showDrive,setShowDrive] = useState(false)
  const [showT212,setShowT212] = useState(false)
  const [showEnableBanking,setShowEnableBanking] = useState(false)
  const [editingName,setEditingName] = useState(false)
  const [nameValue,setNameValue] = useState(me?.nome ?? '')
  const saveName = async () => {
    const v = nameValue.trim(); if(!v) return
    await updateMyProfile({ nome: v })
    setEditingName(false)
    onProfileUpdated()
  }
  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (a:Account) => { setEditing(a); setFormOpen(true) }
  const del = async (id:string) => { if(!confirm('Apagar esta conta? As transações associadas também serão removidas.')) return; await deleteAccount(id); await onRefresh() }
  const resetSaldo = async (a:Account) => {
    if(!confirm(`Zerar o saldo de "${a.nome}"? Volta a €0,00 até importares um novo extracto.`)) return
    await updateAccount(a.id, {saldo_atual:0, saldo_data:null})
    await onRefresh()
  }
  const resetAllSaldos = async () => {
    if(!confirm(`Zerar o saldo de TODAS as ${accounts.length} contas? Esta acção não pode ser desfeita.`)) return
    for(const a of accounts) await updateAccount(a.id, {saldo_atual:0, saldo_data:null})
    await onRefresh()
  }
  return (
    <div style={{position:'fixed',inset:0,background:T.bg,zIndex:90,overflowY:'auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      <div style={{maxWidth:440,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:T.surface,borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,zIndex:10}}>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ArrowLeft size={18} color={T.textSec}/></button>
          <div style={{fontSize:16,fontWeight:700,color:T.text,flex:1}}>Definições</div>
          <button onClick={onRefresh} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><RefreshCw size={16} color={T.textSec}/></button>
        </div>
        <div style={{padding:'16px 14px'}}>
          {/* PERFIL */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'0 2px'}}>
            <span style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase'}}>Perfil</span>
          </div>
          <Card style={{marginBottom:14,padding:'14px 16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:pal.soft,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:pal.accent,flexShrink:0}}>{(me?.nome?.[0]??'?').toUpperCase()}</div>
              <div style={{flex:1,minWidth:0}}>
                {editingName ? (
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <input value={nameValue} onChange={e=>setNameValue(e.target.value)} autoFocus style={{flex:1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:'6px 10px',fontSize:13,color:T.text}}/>
                    <button onClick={saveName} style={{background:pal.accent,color:'#0B0B12',border:'none',borderRadius:8,padding:'6px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>Guardar</button>
                    <button onClick={()=>{setEditingName(false);setNameValue(me?.nome??'')}} style={{background:'none',border:'none',padding:4,cursor:'pointer'}}><X size={14} color={T.textSec}/></button>
                  </div>
                ) : (
                  <>
                    <div style={{fontSize:13,fontWeight:600,color:T.text}}>{me?.nome ?? '—'}</div>
                    <div style={{fontSize:11,color:T.textSec,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{me?.email ?? ''}</div>
                  </>
                )}
              </div>
              {!editingName && <button onClick={()=>{setNameValue(me?.nome??'');setEditingName(true)}} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><Edit2 size={14} color={pal.accent}/></button>}
            </div>
          </Card>

          {/* CONVITES PENDENTES */}
          {pendingInvitesCount > 0 && (
            <button onClick={onShowInvites} style={{width:'100%',display:'flex',alignItems:'center',gap:10,background:pal.soft,border:'none',borderRadius:10,padding:'12px 14px',cursor:'pointer',marginBottom:14}}>
              <Bell size={16} color={pal.accent}/>
              <span style={{flex:1,textAlign:'left',fontSize:13,fontWeight:600,color:pal.accent}}>Convites pendentes</span>
              <span style={{background:pal.accent,color:'#0B0B12',borderRadius:10,padding:'2px 8px',fontSize:11,fontWeight:700}}>{pendingInvitesCount}</span>
            </button>
          )}

          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,padding:'0 2px'}}>
            <span style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase'}}>Contas ({accounts.length})</span>
            <button onClick={openNew} style={{display:'flex',alignItems:'center',gap:4,background:pal.soft,border:'none',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}><Plus size={12} color={pal.accent}/><span style={{fontSize:11,color:pal.accent,fontWeight:600}}>Adicionar</span></button>
          </div>
          <Card style={{marginBottom:14}}>
            {accounts.map((a,i)=>{
              const p=tagPal(a.budget_tag)
              return (
                <div key={a.id} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderBottom:i<accounts.length-1?`1px solid ${T.border}`:'none'}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:p.accent,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.nome}</div><div style={{fontSize:11,color:T.textSec}}>{a.banco} · {dec(accountSaldo(a))}{a.saldo_data?` · ${fmtDate(a.saldo_data)}`:''}</div></div>
                  <button onClick={()=>onMembers(a.id)} title="Membros" style={{background:'none',border:'none',cursor:'pointer',padding:4}}><Users size={14} color={pal.accent}/></button>
                  <button onClick={()=>resetSaldo(a)} title="Zerar saldo" style={{background:'none',border:'none',cursor:'pointer',padding:4}}><RefreshCw size={13} color={T.textTer}/></button>
                  <button onClick={()=>openEdit(a)} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><Edit2 size={14} color={pal.accent}/></button>
                  <button onClick={()=>del(a.id)} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><Trash2 size={14} color={T.textTer}/></button>
                </div>
              )
            })}
            {!accounts.length&&<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem contas configuradas.</div>}
          </Card>
          {accounts.length>0&&(
            <button onClick={resetAllSaldos} style={{width:'100%',background:'none',border:'none',cursor:'pointer',padding:'6px 4px',color:T.textTer,fontSize:11,marginBottom:14,textAlign:'left'}}>↺ Zerar saldo de todas as contas</button>
          )}
          <button onClick={()=>setShowDrive(true)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px 14px',cursor:'pointer',marginBottom:10}}>
            <HardDrive size={16} color={pal.accent}/>
            <span style={{flex:1,textAlign:'left',fontSize:13,fontWeight:600,color:T.text}}>Google Drive</span>
            <span style={{fontSize:11,color:T.textTer}}>›</span>
          </button>
          <button onClick={()=>setShowT212(true)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px 14px',cursor:'pointer',marginBottom:10}}>
            <span style={{fontSize:16}}>📈</span>
            <span style={{flex:1,textAlign:'left',fontSize:13,fontWeight:600,color:T.text}}>Trading 212</span>
            <span style={{fontSize:11,color:T.textTer}}>›</span>
          </button>
          <button onClick={()=>setShowEnableBanking(true)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px 14px',cursor:'pointer',marginBottom:10}}>
            <span style={{fontSize:16}}>🏦</span>
            <span style={{flex:1,textAlign:'left',fontSize:13,fontWeight:600,color:T.text}}>Enable Banking</span>
            <span style={{fontSize:11,color:T.textTer}}>›</span>
          </button>
          <button onClick={()=>setShowRules(true)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px 14px',cursor:'pointer',marginBottom:14}}>
            <BrainCircuit size={16} color={pal.accent}/>
            <span style={{flex:1,textAlign:'left',fontSize:13,fontWeight:600,color:T.text}}>Regras Aprendidas</span>
            <span style={{fontSize:11,color:T.textTer}}>›</span>
          </button>
          <button onClick={async()=>{await supabase.auth.signOut();window.location.reload()}} style={{width:'100%',background:T.surface2,border:`1px solid ${T.border}`,borderRadius:10,padding:'12px',color:T.red,fontSize:13,fontWeight:600,cursor:'pointer'}}>Terminar sessão</button>
        </div>
      </div>
      {formOpen&&<AccountForm initial={editing} onClose={()=>setFormOpen(false)} onSaved={onRefresh} pal={pal} accountsLen={accounts.length}/>}
      {showRules&&<RulesScreen onClose={()=>setShowRules(false)} pal={pal}/>}
      {showDrive&&<DriveSettingsScreen onClose={()=>setShowDrive(false)} accounts={accounts} onRefresh={onRefresh} pal={pal}/>}
      {showT212&&<T212Screen onClose={()=>setShowT212(false)} accounts={accounts} onRefresh={onRefresh} pal={pal}/>}
      {showEnableBanking&&<EnableBankingScreen onClose={()=>setShowEnableBanking(false)} accounts={accounts} onRefresh={onRefresh} pal={pal}/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// IMPORT WIZARD
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// IMPORT WIZARD — real PDF parsing via Gemini + preview (multi-ficheiro)
// ─────────────────────────────────────────────────────────────────
type ParsedTxn = { id:number; data:string; descritivo:string; valor:number; categoria:string; keep:boolean; src:string; catSrc:'regra'|'ia'|'manual' }
type FileMeta = { saldo_final:number|null; iban:string|null; numero_conta:string|null; periodo_fim:string|null }
type ParsedFile = { name:string; meta:FileMeta; ok:boolean; error?:string }

const ImportWizard = ({onClose,accounts,pal,onDone,onRefreshAccounts}:{onClose:()=>void,accounts:Account[],pal:{grad:string,accent:string,soft:string},onDone:()=>void,onRefreshAccounts:()=>void}) => {
  const [step,setStep] = useState<1|2|3>(1)
  const [selAccount,setSelAccount] = useState('')
  const [parsing,setParsing] = useState(false)
  const [progress,setProgress] = useState({done:0,total:0})
  const [parseError,setParseError] = useState('')
  const [files,setFiles] = useState<ParsedFile[]>([])
  const [parsed,setParsed] = useState<ParsedTxn[]>([])
  const [saving,setSaving] = useState(false)
  const [rules,setRules] = useState<CategoryRule[]>([])
  const [driveConnected,setDriveConnected] = useState<boolean|undefined>(undefined)
  const [showDriveFiles,setShowDriveFiles] = useState(false)
  const [showDrivePicker,setShowDrivePicker] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const selAccObj = accounts.find(a=>a.id===selAccount)

  useEffect(()=>{ loadCategoryRules().then(setRules) },[])
  useEffect(()=>{ getDriveConnectionStatus().then(s=>setDriveConnected(!!s)) },[])

  const handleFiles = async (e:React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files ?? [])
    if(!fileList.length) return
    setParsing(true)
    setParseError('')
    setProgress({done:0,total:fileList.length})

    const allTxns:ParsedTxn[] = []
    const fileMetas:ParsedFile[] = []
    let idCounter = 0

    for(const file of fileList) {
      const form = new FormData()
      form.append('file', file)
      try {
        const res = await fetch('/api/parse', {method:'POST', body:form})
        const data = await res.json()
        if(!res.ok || data.error) throw new Error(data.error || `Erro ${res.status}`)
        const txns = (data.transactions ?? []).map((t:any)=>{
          const valor = Number(t.valor)
          // Regra sem excepções: valor positivo é sempre "Receita", mesmo que exista
          // uma regra aprendida diferente para este padrão (ex: vinda de uma despesa antiga).
          if(valor>=0){
            return {
              id: idCounter++, data:t.data, descritivo:t.descritivo, valor,
              categoria:'Receita', keep:true, src:file.name, catSrc:'ia' as 'regra'|'ia'|'manual',
            }
          }
          // Prioridade para despesas: regra aprendida > sugestão do Gemini > fallback
          const ruleCat = matchRule(t.descritivo, rules)
          const cat = ruleCat ?? t.categoria ?? 'Despesas Gerais'
          return {
            id: idCounter++, data:t.data, descritivo:t.descritivo, valor,
            categoria: cat, keep:true, src:file.name,
            catSrc: (ruleCat ? 'regra' : 'ia') as 'regra'|'ia'|'manual',
          }
        })
        allTxns.push(...txns)
        fileMetas.push({
          name:file.name, ok:true,
          meta:{
            saldo_final: data.meta?.saldo_final ?? null,
            iban: data.meta?.iban ?? null,
            numero_conta: data.meta?.numero_conta ?? null,
            periodo_fim: data.meta?.periodo_fim ?? null,
          }
        })
      } catch(err:any) {
        fileMetas.push({name:file.name, ok:false, error:err.message, meta:{saldo_final:null,iban:null,numero_conta:null,periodo_fim:null}})
      }
      setProgress(p=>({...p, done:p.done+1}))
    }

    setFiles(fileMetas)
    setParsed(allTxns)
    setParsing(false)

    if(!allTxns.length) {
      setParseError('Nenhuma transação encontrada em nenhum ficheiro. Verifica se os PDFs têm extratos legíveis.')
    } else {
      setStep(3)
    }
  }

  const toggleKeep = (id:number) => setParsed(p=>p.map(t=>t.id===id?{...t,keep:!t.keep}:t))
  const setCat = (id:number,cat:string) => setParsed(p=>p.map(t=>t.id===id?{...t,categoria:cat,catSrc:'manual' as const}:t))
  const toSave = parsed.filter(t=>t.keep)

  // Escolhe os metadados do ficheiro com periodo_fim mais recente (o extrato mais actual)
  const bestMeta = files
    .filter(f=>f.ok && f.meta.periodo_fim)
    .sort((a,b)=>(b.meta.periodo_fim ?? '').localeCompare(a.meta.periodo_fim ?? ''))[0]?.meta ?? null

  const confirmImport = async () => {
    setSaving(true)
    const txns = toSave.map((t,i)=>({
      account_id:selAccount, data:t.data, descritivo:t.descritivo, valor:t.valor,
      categoria:t.categoria, categoria_confirmada:false, ai_confianca:null,
      excluir_analise:false, imovel_classificado:false, ordem_extrato:t.id,
      hash:`${selAccount}-${t.data}-${t.descritivo.slice(0,20)}-${t.valor}-${Date.now()}-${i}`,
      import_batch_id:null, imovel_id:null, notas:null, subcategoria:null, descritivo_norm:null,
    }))
    await saveTransactions(txns as any)

    // Aprendizagem: reforça/cria regras com base na categoria final de cada transação importada
    // (cobre tanto sugestões da IA aceites como correcções manuais no preview)
    for(const t of toSave) {
      await learnFromCategorization(t.descritivo, t.categoria)
    }

    // Só actualiza o saldo se o extrato mais recente for de facto mais recente
    // que a última actualização já gravada na conta (evita extratos antigos sobrescreverem dados novos)
    if(selAccObj && bestMeta) {
      const updates:any = {}
      const novaData = bestMeta.periodo_fim
      const dataActual = selAccObj.saldo_data
      const ehMaisRecente = !dataActual || (novaData && novaData > dataActual)
      if(bestMeta.saldo_final !== null && ehMaisRecente) {
        updates.saldo_atual = bestMeta.saldo_final
        updates.saldo_data = novaData
      }
      if(bestMeta.iban && !selAccObj.iban) updates.iban = bestMeta.iban
      if(bestMeta.numero_conta && !selAccObj.numero_conta) updates.numero_conta = bestMeta.numero_conta
      if(Object.keys(updates).length) await updateAccount(selAccObj.id, updates)
    }

    await onDone(); setSaving(false); onClose()
  }

  const totalRec = toSave.filter(t=>t.valor>0).reduce((s,t)=>s+t.valor,0)
  const totalDesp = toSave.filter(t=>t.valor<0).reduce((s,t)=>s+Math.abs(t.valor),0)
  const stepLabel = step===1?'Conta':step===2?'Ficheiros':'Confirmar'
  const okFiles = files.filter(f=>f.ok)
  const failedFiles = files.filter(f=>!f.ok)

  return (
    <div onClick={()=>!parsing&&onClose()} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:100,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:'20px 20px 0 0',width:'100%',maxWidth:440,maxHeight:'92vh',display:'flex',flexDirection:'column',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'}}>
        <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv" multiple onChange={handleFiles} style={{display:'none'}}/>
        {/* Header */}
        <div style={{flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 18px',borderBottom:`1px solid ${T.border}`}}>
            {step>1&&!parsing&&<button onClick={()=>{setStep(s=>(s-1) as any);setParseError('')}} style={{background:'none',border:'none',cursor:'pointer'}}><ArrowLeft size={18} color={T.textSec}/></button>}
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700,color:T.text}}>Importar Extractos</div>
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
              <div style={{fontSize:13,color:T.textSec,marginBottom:16}}>Para qual conta são estes extractos?</div>
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
                  <div style={{fontSize:13,color:T.textSec,marginBottom:16}}>Selecciona a origem do extracto:</div>
                  <div onClick={(e)=>{e.stopPropagation();fileRef.current?.click()}} style={{display:'flex',alignItems:'center',gap:14,padding:'16px',background:T.surface2,borderRadius:12,marginBottom:10,cursor:'pointer',border:`1px solid ${T.border}`}}>
                    <div style={{width:44,height:44,borderRadius:12,background:pal.soft,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><FileText size={22} color={pal.accent}/></div>
                    <div><div style={{fontSize:14,fontWeight:600,color:T.text}}>Upload do dispositivo</div><div style={{fontSize:12,color:T.textSec,marginTop:2}}>PDF, Excel ou CSV · Vários ficheiros</div></div>
                  </div>
                  {driveConnected===undefined&&(
                    <div style={{display:'flex',alignItems:'center',gap:14,padding:'16px',background:T.surface2,borderRadius:12,opacity:0.5,border:`1px solid ${T.border}`}}>
                      <div style={{width:44,height:44,borderRadius:12,background:T.surface3,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><HardDrive size={22} color={T.textSec}/></div>
                      <div><div style={{fontSize:14,fontWeight:600,color:T.text}}>Google Drive</div><div style={{fontSize:12,color:T.textSec,marginTop:2}}>A verificar…</div></div>
                    </div>
                  )}
                  {driveConnected===false&&(
                    <div onClick={async()=>{const url=await getDriveAuthUrl(); if(url) window.location.href=url}} style={{display:'flex',alignItems:'center',gap:14,padding:'16px',background:T.surface2,borderRadius:12,cursor:'pointer',border:`1px solid ${T.border}`}}>
                      <div style={{width:44,height:44,borderRadius:12,background:pal.soft,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><HardDrive size={22} color={pal.accent}/></div>
                      <div><div style={{fontSize:14,fontWeight:600,color:T.text}}>Ligar Google Drive</div><div style={{fontSize:12,color:T.textSec,marginTop:2}}>Importa automaticamente de pastas que escolheres</div></div>
                    </div>
                  )}
                  {driveConnected===true&&(
                    <div onClick={()=>selAccObj?.drive_folder_id?setShowDriveFiles(true):setShowDrivePicker(true)} style={{display:'flex',alignItems:'center',gap:14,padding:'16px',background:T.surface2,borderRadius:12,cursor:'pointer',border:`1px solid ${T.border}`}}>
                      <div style={{width:44,height:44,borderRadius:12,background:pal.soft,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><HardDrive size={22} color={pal.accent}/></div>
                      <div>
                        <div style={{fontSize:14,fontWeight:600,color:T.text}}>Google Drive</div>
                        <div style={{fontSize:12,color:T.textSec,marginTop:2}}>{selAccObj?.drive_folder_id?`📂 ${selAccObj.drive_folder_name}`:'Toca para associar uma pasta a esta conta'}</div>
                      </div>
                    </div>
                  )}
                </>
              )}
              {parsing&&(
                <div style={{textAlign:'center',padding:'32px 0'}}>
                  <div style={{width:56,height:56,borderRadius:16,background:pal.soft,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}><Zap size={26} color={pal.accent}/></div>
                  <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>A processar ficheiro {progress.done+1} de {progress.total}…</div>
                  <div style={{fontSize:12,color:T.textTer}}>O Gemini está a ler os extractos. Pode demorar alguns segundos por ficheiro.</div>
                  <div style={{height:4,background:T.border,borderRadius:2,marginTop:16,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${progress.total?progress.done/progress.total*100:0}%`,background:pal.accent,transition:'width 0.3s'}}/>
                  </div>
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

              {/* Ficheiros processados */}
              {files.length>1&&(
                <Card style={{marginBottom:14,padding:'10px 14px'}}>
                  <div style={{fontSize:11,fontWeight:600,color:T.textSec,marginBottom:6}}>📄 {okFiles.length} ficheiros processados{failedFiles.length?` · ${failedFiles.length} falharam`:''}</div>
                  {failedFiles.map((f,i)=>(<div key={i} style={{fontSize:11,color:T.red,marginTop:2}}>✗ {f.name}: {f.error}</div>))}
                </Card>
              )}

              {/* O que vai actualizar na conta */}
              {bestMeta&&(bestMeta.saldo_final!==null || (bestMeta.iban&&!selAccObj?.iban) || (bestMeta.numero_conta&&!selAccObj?.numero_conta))&&(
                <Card style={{background:pal.soft,padding:'11px 14px',marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:600,color:pal.accent,marginBottom:6}}>📋 Vai actualizar a conta (extrato mais recente: {bestMeta.periodo_fim?fmtDate(bestMeta.periodo_fim):'—'})</div>
                  {bestMeta.saldo_final!==null&&<div style={{fontSize:12,color:T.textSec,marginBottom:2}}>Saldo → <span style={{color:T.text,fontWeight:600}}>{dec(bestMeta.saldo_final)}</span></div>}
                  {bestMeta.iban&&!selAccObj?.iban&&<div style={{fontSize:12,color:T.textSec,marginBottom:2}}>IBAN → <span style={{color:T.text,fontWeight:600}}>{bestMeta.iban}</span></div>}
                  {bestMeta.numero_conta&&!selAccObj?.numero_conta&&<div style={{fontSize:12,color:T.textSec}}>Nº conta → <span style={{color:T.text,fontWeight:600}}>{bestMeta.numero_conta}</span></div>}
                  {selAccObj?.saldo_data&&bestMeta.periodo_fim&&bestMeta.periodo_fim<=selAccObj.saldo_data&&(
                    <div style={{fontSize:11,color:T.textTer,marginTop:4}}>ℹ️ Saldo não vai mudar: já tens dados mais recentes ({fmtDate(selAccObj.saldo_data)}).</div>
                  )}
                </Card>
              )}

              {/* Lista de transações */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{fontSize:11,color:T.textTer,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase'}}>Transações encontradas</span>
                <div style={{display:'flex',gap:8}}>
                  <span style={{fontSize:10,color:T.textTer,display:'flex',alignItems:'center',gap:3}}><Target size={10}/> regra</span>
                  <span style={{fontSize:10,color:T.textTer,display:'flex',alignItems:'center',gap:3}}><Sparkles size={10}/> IA</span>
                </div>
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
                        {t.catSrc==='regra'&&<span style={{display:'flex',alignItems:'center',gap:2,background:pal.soft,borderRadius:4,padding:'1px 5px'}}><Target size={9} color={pal.accent}/><span style={{fontSize:9,color:pal.accent,fontWeight:600}}>regra</span></span>}
                        {t.catSrc==='ia'&&<span style={{display:'flex',alignItems:'center',gap:2,background:'rgba(167,139,250,0.12)',borderRadius:4,padding:'1px 5px'}}><Sparkles size={9} color="#A78BFA"/><span style={{fontSize:9,color:'#A78BFA',fontWeight:600}}>IA</span></span>}
                        <select value={t.categoria} onChange={e=>setCat(t.id,e.target.value)} onClick={e=>e.stopPropagation()}
                          style={{fontSize:10,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:'1px 4px',color:T.textSec,outline:'none',cursor:'pointer'}}>
                          {(t.valor>=0 ? ['Receita'] : CAT_LIST.filter(c=>c!=='Receita')).map(c=><option key={c} value={c}>{c}</option>)}
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
              <Btn onClick={()=>{setStep(2);setParseError('');setFiles([]);setParsed([])}} variant="ghost" accent={pal.accent} style={{flex:1}}>← Repetir</Btn>
              <Btn onClick={confirmImport} variant="primary" accent={pal.accent} style={{flex:2}}>
                {saving?'A guardar…':`✓ Importar ${toSave.length} transações`}
              </Btn>
            </div>
          )}
        </div>
      </div>
      {showDrivePicker&&selAccObj&&<DriveFolderPicker account={selAccObj} onClose={()=>setShowDrivePicker(false)} onSaved={async()=>{await onRefreshAccounts();setShowDrivePicker(false);setShowDriveFiles(true)}} pal={pal}/>}
      {showDriveFiles&&selAccObj&&<DriveFileSelectScreen account={selAccObj} onClose={()=>setShowDriveFiles(false)} onRefresh={async()=>{await onRefreshAccounts();await onDone();setShowDriveFiles(false);onClose()}} pal={pal}/>}
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────
// SCREENS
// ─────────────────────────────────────────────────────────────────
const BudgetScreen = ({accounts,transactions,tag,pal,title,onViewAllTxns,onRefresh}:{accounts:Account[],transactions:Transaction[],tag:string,pal:{grad:string,accent:string,soft:string},title:string,onViewAllTxns:(categoria?:string,contaId?:string)=>void,onRefresh:()=>void}) => {
  const [sel,setSel] = useState<string|null>(null)
  const [catSel,setCatSel] = useState<string|null>(null)
  const [editTxn,setEditTxn] = useState<Transaction|null>(null)
  const [showAllCats,setShowAllCats] = useState(false)
  const [monthOffset,setMonthOffset] = useState(0)
  const tagAccs = accounts.filter(a=>a.budget_tag===tag)
  const view = computeView(accounts,transactions,tag,sel,monthOffset)
  const period = monthYearLabel(view.refMonth)
  const selName = tagAccs.find(a=>a.id===sel)?.nome.split(' ').slice(-1)[0]
  const topCats = view.cats.slice(0,9)
  // Can't go forward past the latest month with data
  const canGoForward = monthOffset < 0

  // Quando uma categoria está seleccionada, filtra gráfico + lista de transações abaixo
  const catTrend = useMemo(()=>{
    if(!catSel || !view.refMonth) return view.trend
    const accIds = new Set((sel?tagAccs.filter(a=>a.id===sel):tagAccs).map(a=>a.id))
    return Array.from({length:5},(_,i)=>{
      const offset=i-4
      const [ry,rm] = view.refMonth!.split('-').map(Number)
      const d = new Date(ry,rm-1,1); d.setMonth(d.getMonth()+offset)
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const total = transactions.filter(t=>accIds.has(t.account_id)&&t.data.startsWith(ym)&&t.categoria===catSel&&t.valor<0).reduce((s,t)=>s+Math.abs(t.valor),0)
      return {m:getMonthLabel(offset,view.refMonth!),rec:0,desp:total}
    })
  },[catSel,view.trend,view.refMonth,transactions,sel,tagAccs])

  const catTxns = useMemo(()=>{
    if(!catSel) return view.txns
    if(!view.refMonth) return []
    const accIds = new Set((sel?tagAccs.filter(a=>a.id===sel):tagAccs).map(a=>a.id))
    // 'transactions' já vem ordenado de forma estável pela query (data desc, created_at asc);
    // .filter() preserva essa ordem, não é preciso reordenar aqui.
    return transactions
      .filter(t=>accIds.has(t.account_id)&&t.data.startsWith(view.refMonth!)&&t.categoria===catSel)
  },[catSel,view.txns,view.refMonth,transactions,sel,tagAccs])

  return (
    <div>
      <Hero pal={pal} title={title} period={period} mainValue={big(view.saldo)} mainColor={view.saldo<0?'#FCA5A5':'#FFF'} trend={view.trend} kpis={[{l:'Receitas',v:dec(view.rec),c:'#4ADE80'},{l:'Despesas',v:dec(view.desp),c:'#F87171'},{l:'Saldo mês',v:sgn(view.net),c:view.net>=0?'#4ADE80':'#F87171'}]} onPrev={()=>{setMonthOffset(o=>o-1);setCatSel(null)}} onNext={()=>{if(canGoForward){setMonthOffset(o=>o+1);setCatSel(null)}}} canNext={canGoForward}/>
      <AccountList accounts={tagAccs} sel={sel} onSel={setSel} pal={pal}/>
      <div style={{marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'0 2px',minHeight:26}}>
          <span style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase'}}>{sel?`Despesas — ${selName}`:'Despesas'}</span>
          <div style={{display:'flex',gap:8}}>
            {catSel&&<button onClick={()=>setCatSel(null)} style={{display:'flex',alignItems:'center',gap:4,background:pal.soft,border:'none',borderRadius:8,padding:'3px 8px',cursor:'pointer'}}><span style={{fontSize:12,color:pal.accent,fontWeight:600}}>×</span><span style={{fontSize:11,color:pal.accent,fontWeight:600}}>Ver tudo</span></button>}
            {!catSel&&<span onClick={()=>setShowAllCats(true)} style={{fontSize:12,color:pal.accent,fontWeight:600,cursor:'pointer'}}>Ver todas →</span>}
          </div>
        </div>
        <Card>{topCats.length?topCats.map((c,i,a)=>{
          const active = catSel===c.nome
          return (
            <div key={i} onClick={()=>setCatSel(active?null:c.nome)} style={{borderLeft:active?`3px solid ${pal.accent}`:'3px solid transparent',background:active?pal.soft:'transparent',transition:'all 0.12s'}}>
              <CatRow {...c} last={i===a.length-1}/>
            </div>
          )
        }):<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem despesas este mês. Importa um extracto.</div>}</Card>
      </div>
      <TrendTile data={catTrend} accent={pal.accent} catFilter={catSel}/>
      <div style={{marginBottom:20}}>
        <Lbl title={catSel?`Transações — ${catSel}`:'Últimas transações'} action="Ver todas →" accent={pal.accent} onAction={()=>onViewAllTxns(catSel??undefined, sel??undefined)}/>
        <Card>{catTxns.length?catTxns.map((t,i)=><TxnRow key={t.id} t={t} last={i===catTxns.length-1} onClick={()=>setEditTxn(t)} accounts={tagAccs}/>):<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem transações. Importa o teu primeiro extracto.</div>}</Card>
      </div>
      {editTxn&&<TxnEditForm txn={editTxn} onClose={()=>setEditTxn(null)} onSaved={onRefresh} pal={pal} accounts={accounts}/>}
      {showAllCats&&<AllCategoriesScreen transactions={transactions} accounts={accounts} tag={tag} sel={sel} initialMonth={view.refMonth} subtitle={title.replace('Conta Corrente ','')} onClose={()=>setShowAllCats(false)} onSelectCategoria={(cat,month)=>{setShowAllCats(false);onViewAllTxns(cat, sel??undefined)}} pal={pal}/>}
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
          <DateInp label="Data da última actualização" value={form.valorizacao_data} onChange={f('valorizacao_data')}/>
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
                <div style={{width:34,height:34,borderRadius:10,background:T.surface2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0}}>{getCatStyle(t.categoria??'Despesas Gerais').icon}</div>
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
const ImoveisScreen = ({imoveis,transactions,accounts,contaImovel,pal,onRefresh,onViewAll}:{imoveis:Imovel[],transactions:Transaction[],accounts:Account[],contaImovel:ContaImovel[],pal:{grad:string,accent:string,soft:string},onRefresh:()=>void,onViewAll:(imovelId?:string)=>void}) => {
  const [formOpen,setFormOpen] = useState(false)
  const [editing,setEditing] = useState<Imovel|null>(null)
  const [showQueue,setShowQueue] = useState(false)
  const [editTxn,setEditTxn] = useState<Transaction|null>(null)
  const [selAcc,setSelAcc] = useState<string|null>(null)
  const [selImovel,setSelImovel] = useState<string|null>(null)
  const [monthOffset,setMonthOffset] = useState(0)

  const investAccounts = accounts.filter(a=>a.budget_tag==='investimento')
  const investAccountIds = new Set(investAccounts.map(a=>a.id))

  const matchAcc = (t:Transaction) => selAcc ? t.account_id===selAcc : true
  // Filtra por imóvel seleccionado se houver
  const matchImovel = (t:Transaction) => selImovel ? t.imovel_id===selImovel : true
  const imovelTxnsScope = transactions.filter(t=>investAccountIds.has(t.account_id)&&matchAcc(t)&&matchImovel(t))
  const latestMonth = latestMonthWithData(imovelTxnsScope) ?? `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`

  // Mês actual ajustado pelo offset de navegação
  const ym = (() => {
    const [ly,lm] = latestMonth.split('-').map(Number)
    const d = new Date(ly,lm-1,1); d.setMonth(d.getMonth()+monthOffset)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })()
  const canGoForward = monthOffset < 0

  // Renda/custos por imóvel (respeita filtro de imóvel seleccionado)
  const getImRenda = (id:string) => transactions.filter(t=>t.imovel_id===id&&matchAcc(t)&&t.data.startsWith(ym)&&t.valor>0).reduce((s,t)=>s+t.valor,0)
  const getImCusto = (id:string) => transactions.filter(t=>t.imovel_id===id&&matchAcc(t)&&t.data.startsWith(ym)&&t.valor<0).reduce((s,t)=>s+Math.abs(t.valor),0)
  const linkedAccounts = (imovelId:string) => new Set(contaImovel.filter(ci=>ci.imovel_id===imovelId).map(ci=>ci.account_id))

  // KPIs: quando há imóvel seleccionado, mostra só esse; caso contrário, todos
  const imovelList = selImovel ? imoveis.filter(im=>im.id===selImovel) : imoveis
  const totRenda=imovelList.reduce((s,im)=>s+getImRenda(im.id),0)
  const totCusto=imovelList.reduce((s,im)=>s+getImCusto(im.id),0)
  const totRes=totRenda-totCusto
  const ativos=imoveis.filter(im=>im.ativo).length

  // Saldo da(s) conta(s) de investimento
  const saldoContas = (selAcc ? investAccounts.filter(a=>a.id===selAcc) : investAccounts).reduce((s,a)=>s+accountSaldo(a),0)

  // Valorização total (100%) e toggle
  const [showValoriz,setShowValoriz] = useState(false)
  const totValoriz = imovelList.reduce((s,im)=>s+(im.valorizacao||0),0)

  // KPIs do hero
  const imoveisKpis = [
    {l:'Rendas',v:dec(totRenda),c:'#4ADE80'},
    {l:'Custos',v:dec(totCusto),c:'#F87171'},
    {l:'Saldo mês',v:sgn(totRes),c:totRes>=0?'#4ADE80':'#F87171'},
  ]

  // Fila por associar
  const porAssociar = transactions.filter(t=>investAccountIds.has(t.account_id) && !t.imovel_classificado)

  // Transações recentes filtradas por conta e imóvel
  const recentTxns = transactions.filter(t=>investAccountIds.has(t.account_id) && matchAcc(t) && matchImovel(t)).slice(0,8)

  // Sparkline: filtra por imóvel seleccionado quando aplicável
  const trend=imovelTxnsScope.length?Array.from({length:5},(_,i)=>{
    const offset=i-4
    const [ry,rm] = ym.split('-').map(Number)
    const d = new Date(ry,rm-1,1); d.setMonth(d.getMonth()+offset)
    const ym2=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const baseTxns = transactions.filter(t=>investAccountIds.has(t.account_id)&&matchAcc(t)&&matchImovel(t)&&t.data.startsWith(ym2))
    const mRec=baseTxns.filter(t=>t.valor>0).reduce((s,t)=>s+t.valor,0)
    const mDesp=baseTxns.filter(t=>t.valor<0).reduce((s,t)=>s+Math.abs(t.valor),0)
    return{m:getMonthLabel(offset,ym),rec:mRec,desp:mDesp,net:mRec-mDesp}
  }):[]

  const imovelNome = (id:string|null) => id ? (imoveis.find(im=>im.id===id)?.nome ?? 'Imóvel') : null

  return (
    <div>
      <Hero pal={pal} title={selImovel ? `Imóvel — ${imoveis.find(i=>i.id===selImovel)?.nome??''}` : 'Conta Corrente Imóveis'} period={monthYearLabel(ym)} mainValue={big(saldoContas)} mainColor={saldoContas<0?'#FCA5A5':'#FFF'} trend={trend} kpis={imoveisKpis} onPrev={()=>setMonthOffset(o=>o-1)} onNext={()=>{if(canGoForward)setMonthOffset(o=>o+1)}} canNext={canGoForward}/>
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
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'0 2px',minHeight:26}}>
        <span style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase'}}>Por imóvel</span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {selImovel&&<button onClick={()=>setSelImovel(null)} style={{display:'flex',alignItems:'center',gap:4,background:pal.soft,border:'none',borderRadius:8,padding:'3px 8px',cursor:'pointer'}}><span style={{fontSize:12,color:pal.accent,fontWeight:600}}>×</span><span style={{fontSize:11,color:pal.accent,fontWeight:600}}>Ver todos</span></button>}
          <button onClick={()=>{setEditing(null);setFormOpen(true)}} style={{display:'flex',alignItems:'center',gap:4,background:pal.soft,border:'none',borderRadius:8,padding:'4px 10px',cursor:'pointer'}}><Plus size={12} color={pal.accent}/><span style={{fontSize:11,color:pal.accent,fontWeight:600}}>Adicionar</span></button>
        </div>
      </div>
      {imoveis.length===0&&<Card style={{marginBottom:20}}><div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>Sem imóveis ainda. Toca em "Adicionar" para criar o primeiro.</div></Card>}
      {imoveis.map(im=>{
        const renda=getImRenda(im.id), custo=getImCusto(im.id), res=renda-custo, pos=res>=0
        const nLinks=contaImovel.filter(ci=>ci.imovel_id===im.id).length
        const temValoriz=(im.valorizacao||0)>0
        return (
          <div key={im.id} onClick={()=>setSelImovel(s=>s===im.id?null:im.id)} style={{background:pos?PROP_GRAD.pos:PROP_GRAD.neg,borderRadius:14,padding:'15px 16px',marginBottom:10,border:'1px solid rgba(255,255,255,0.06)',borderLeft:selImovel===im.id?`4px solid ${pal.accent}`:'1px solid rgba(255,255,255,0.06)',cursor:'pointer',transition:'border-left 0.15s'}}>
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
                <button onClick={e=>{e.stopPropagation();setEditing(im);setFormOpen(true)}} style={{background:'rgba(255,255,255,0.1)',border:'none',borderRadius:8,padding:6,cursor:'pointer'}}><Edit2 size={13} color="#FFF"/></button>
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
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'0 2px',minHeight:26}}>
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
        <Lbl title={selImovel?`Transações — ${imoveis.find(i=>i.id===selImovel)?.nome??''}`:(selAcc?`Transações — ${investAccounts.find(a=>a.id===selAcc)?.nome.split(' ').slice(-1)[0]}`:'Últimas transações')} action="Ver todas →" accent={pal.accent} onAction={()=>onViewAll(selImovel??undefined)}/>
        <Card>
          {recentTxns.length===0&&<div style={{padding:24,textAlign:'center',color:T.textSec,fontSize:13}}>{selImovel?'Sem transações para este imóvel neste mês.':'Sem transações. Importa um extracto de uma conta de investimento.'}</div>}
          {recentTxns.map((t,i)=>{
            const imN = imovelNome(t.imovel_id)
            return (
              <div key={t.id} onClick={()=>setEditTxn(t)} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',borderBottom:i<recentTxns.length-1?`1px solid ${T.border}`:'none',cursor:'pointer'}}>
                <div style={{width:38,height:38,borderRadius:12,background:T.surface2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,flexShrink:0}}>{getCatStyle(t.categoria??'Despesas Gerais').icon}</div>
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
      {editTxn&&<TxnEditForm txn={editTxn} onClose={()=>setEditTxn(null)} onSaved={onRefresh} pal={pal} imoveis={imoveis} accounts={accounts}/>}
    </div>
  )
}

const PatrimonioScreen = ({accounts,imoveis,transactions,pal}:{accounts:Account[],imoveis:Imovel[],transactions:Transaction[],pal:{grad:string,accent:string,soft:string}}) => {
  const [showValoriz,setShowValoriz] = useState(false)

  const sumTag = (tag:string) => accounts.filter(a=>a.budget_tag===tag).reduce((s,a)=>s+accountSaldo(a),0)
  const quotaTag = (tag:string) => accounts.filter(a=>a.budget_tag===tag).reduce((s,a)=>s+accountSaldo(a)*((a.my_ownership_pct??a.ownership_pct)/100),0)

  const pesSaldo=sumTag('pessoal'), famSaldo=sumTag('familiar'), invSaldo=sumTag('investimento')
  const pesQuota=quotaTag('pessoal'), famQuota=quotaTag('familiar'), invQuota=quotaTag('investimento')

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
  const now=new Date()
  const refMonth = latestMonthWithData(transactions) ?? `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const period = monthYearLabel(refMonth)
  const trend=Array.from({length:5},(_,i)=>({m:getMonthLabel(i-4,refMonth),rec:totalBruto*(0.9+i*.025),desp:0,net:totalBruto*(0.9+i*.025)}))
  return (
    <div>
      <Hero pal={pal} title="Património — Saldos" period={period} mainValue={big(minhaQuota)} mainColor={minhaQuota<0?'#FCA5A5':'#FFF'} trend={trend} kpis={[{l:'Total bruto',v:big(totalBruto),c:'rgba(255,255,255,0.45)'},{l:'A tua quota',v:big(minhaQuota),c:'#FFF'},{l:'Contas',v:String(accounts.length),c:'rgba(255,255,255,0.7)'}]} sparkMode="patrimonio"/>

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
// MEMBROS DE CONTA
// ─────────────────────────────────────────────────────────────────
const PctInput = ({value,onCommit,disabled}:{value:number,onCommit:(n:number)=>void,disabled?:boolean}) => {
  const [v,setV] = useState(String(value))
  // Sincronizar com o valor externo sempre que mudar (ex: após refresh do servidor)
  useEffect(()=>{ setV(String(value)) },[value])
  const commit = () => {
    const n = Math.max(0, Math.min(100, Number(v)||0))
    if (n !== value) onCommit(n)
    else setV(String(value)) // reset visual se inválido
  }
  return (
    <input type="number" min={0} max={100} value={v} disabled={disabled}
      onChange={e=>setV(e.target.value)}
      onBlur={commit}
      onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur()}}
      style={{width:54,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:6,padding:'4px 6px',fontSize:12,color:T.text,textAlign:'right'}}/>
  )
}

const MembersScreen = ({accountId,accounts,onClose,pal,onChanged}:{accountId:string,accounts:Account[],onClose:()=>void,pal:{accent:string,soft:string},onChanged:()=>void}) => {
  const account = accounts.find(a=>a.id===accountId)
  const [members,setMembers] = useState<AccountMember[]>([])
  const [pending,setPending] = useState<Array<{id:string,invited_nome:string,invited_email:string|null,created_at:string}>>([])
  const [loading,setLoading] = useState(true)
  const [inviteEmail,setInviteEmail] = useState('')
  const [inviteMsg,setInviteMsg] = useState<{txt:string,err:boolean}|null>(null)
  const [busy,setBusy] = useState(false)
  const refresh = useCallback(async()=>{
    setLoading(true)
    const [m, p] = await Promise.all([loadAccountMembers(accountId), loadAccountPendingInvites(accountId)])
    setMembers(m)
    setPending(p.map(x=>({id:x.id, invited_nome:x.invited_nome, invited_email:x.invited_email, created_at:x.created_at})))
    setLoading(false)
  },[accountId])
  useEffect(()=>{ refresh() },[refresh])

  const totalPct = members.reduce((s,m)=>s+m.ownership_pct,0)

  const doInvite = async () => {
    const email = inviteEmail.trim()
    if(!email) return
    setBusy(true); setInviteMsg(null)
    const u = await findUserByEmail(email)
    if(!u){ setInviteMsg({txt:'Não existe utilizador com esse email',err:true}); setBusy(false); return }
    if(members.some(m=>m.user_id===u.id)){ setInviteMsg({txt:'Este utilizador já é membro',err:true}); setBusy(false); return }
    const res = await inviteUserToAccount(accountId, u.id)
    if(res.error){ setInviteMsg({txt:'Erro: '+res.error.message,err:true}); setBusy(false); return }
    setInviteMsg({txt:'✓ Convite enviado',err:false})
    setInviteEmail('')
    setBusy(false)
    await refresh()
  }
  const changePct = async (m:AccountMember, v:string) => {
    const n = Math.max(0, Math.min(100, Number(v)||0))
    if (n === m.ownership_pct) return
    await updateMemberOwnership(m.id, n); await refresh(); onChanged()
  }
  const doRemove = async (m:AccountMember) => {
    if(!confirm(`Remover ${m.nome} desta conta?`)) return
    await removeMember(m.id); await refresh(); onChanged()
  }
  const doCancelInvite = async (id:string) => {
    if(!confirm('Cancelar este convite pendente?')) return
    await cancelInvite(id); await refresh()
  }

  return (
    <div style={{position:'fixed',inset:0,background:T.bg,zIndex:95,overflowY:'auto'}}>
      <div style={{maxWidth:440,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:T.surface,borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,zIndex:10}}>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ArrowLeft size={18} color={T.textSec}/></button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,fontWeight:700,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Membros</div>
            <div style={{fontSize:11,color:T.textSec,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{account?.nome ?? ''}</div>
          </div>
          <button onClick={refresh} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><RefreshCw size={14} color={T.textSec}/></button>
        </div>
        <div style={{padding:'16px 14px'}}>
          <Card style={{marginBottom:14}}>
            {loading ? (
              <div style={{padding:20,textAlign:'center',fontSize:12,color:T.textSec}}>A carregar…</div>
            ) : members.length===0 ? (
              <div style={{padding:20,textAlign:'center',fontSize:12,color:T.textSec}}>Sem membros</div>
            ) : members.map((m,i)=>(
              <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderBottom:i<members.length-1?`1px solid ${T.border}`:'none'}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:pal.soft,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:pal.accent,flexShrink:0}}>{(m.nome?.[0]??'?').toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.nome}</div>
                  <div style={{fontSize:11,color:T.textSec,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.email ?? ''}{m.status==='pending'?' · pendente':''}</div>
                </div>
                <PctInput value={m.ownership_pct} onCommit={(n)=>changePct(m, String(n))}/>
                <span style={{fontSize:11,color:T.textSec}}>%</span>
                {members.length>1 && <button onClick={()=>doRemove(m)} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><Trash2 size={14} color={T.textTer}/></button>}
              </div>
            ))}
          </Card>
          <div style={{fontSize:11,color:totalPct===100?T.textSec:'#F87171',marginBottom:14,padding:'0 4px'}}>Soma das %: {totalPct}%{totalPct!==100?' (deve totalizar 100%)':''}</div>

          {/* CONVITES PENDENTES */}
          {pending.length > 0 && (
            <>
              <div style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase',marginBottom:8,padding:'0 2px'}}>Convites pendentes</div>
              <Card style={{marginBottom:14}}>
                {pending.map((inv,i)=>(
                  <div key={inv.id} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderBottom:i<pending.length-1?`1px solid ${T.border}`:'none'}}>
                    <div style={{width:32,height:32,borderRadius:'50%',background:T.surface2,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Mail size={14} color={T.textSec}/></div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:T.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{inv.invited_nome || inv.invited_email}</div>
                      <div style={{fontSize:11,color:T.textSec}}>Aguarda aceitação</div>
                    </div>
                    <button onClick={()=>doCancelInvite(inv.id)} title="Cancelar convite" style={{background:'none',border:'none',cursor:'pointer',padding:4}}><X size={14} color={T.textTer}/></button>
                  </div>
                ))}
              </Card>
            </>
          )}

          {/* CONVIDAR */}
          <div style={{fontSize:11,fontWeight:700,color:T.textTer,letterSpacing:'0.09em',textTransform:'uppercase',marginBottom:8,padding:'0 2px'}}>Convidar utilizador</div>
          <Card style={{padding:'12px 14px',marginBottom:8}}>
            <div style={{display:'flex',gap:6}}>
              <input value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="email@exemplo.com" type="email" style={{flex:1,background:T.surface2,border:`1px solid ${T.border}`,borderRadius:8,padding:'8px 10px',fontSize:13,color:T.text}}/>
              <button onClick={doInvite} disabled={busy||!inviteEmail.trim()} style={{background:pal.accent,color:'#0B0B12',border:'none',borderRadius:8,padding:'8px 14px',fontSize:12,fontWeight:700,cursor:'pointer',opacity:(busy||!inviteEmail.trim())?0.5:1}}><UserPlus size={13}/></button>
            </div>
            {inviteMsg && <div style={{fontSize:11,color:inviteMsg.err?'#F87171':'#4ADE80',marginTop:8}}>{inviteMsg.txt}</div>}
          </Card>
          <div style={{fontSize:10,color:T.textTer,padding:'0 4px',lineHeight:1.5}}>O utilizador convidado precisa de já ter conta na plataforma. Ele recebe o convite e pode aceitar ou rejeitar.</div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// CONVITES PENDENTES
// ─────────────────────────────────────────────────────────────────
const InvitesScreen = ({invites,onClose,pal,onChanged}:{invites:AccountInvite[],onClose:()=>void,pal:{accent:string,soft:string},onChanged:()=>void}) => {
  const [busy,setBusy] = useState<string|null>(null)
  const doAccept = async (id:string) => { setBusy(id); await acceptInvite(id); await onChanged(); setBusy(null) }
  const doReject = async (id:string) => { setBusy(id); await rejectInvite(id); await onChanged(); setBusy(null) }
  return (
    <div style={{position:'fixed',inset:0,background:T.bg,zIndex:95,overflowY:'auto'}}>
      <div style={{maxWidth:440,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:T.surface,borderBottom:`1px solid ${T.border}`,position:'sticky',top:0,zIndex:10}}>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><ArrowLeft size={18} color={T.textSec}/></button>
          <div style={{fontSize:16,fontWeight:700,color:T.text,flex:1}}>Convites pendentes</div>
        </div>
        <div style={{padding:'16px 14px'}}>
          {invites.length===0 ? (
            <div style={{padding:40,textAlign:'center',fontSize:13,color:T.textSec}}>
              <Mail size={32} color={T.textTer} style={{marginBottom:12}}/>
              <div>Sem convites pendentes</div>
            </div>
          ) : invites.map(inv => (
            <Card key={inv.id} style={{padding:'14px 16px',marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:4}}>{inv.account_nome}</div>
              <div style={{fontSize:11,color:T.textSec,marginBottom:12}}>Convite de <strong style={{color:T.text}}>{inv.invited_by_nome}</strong></div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>doAccept(inv.id)} disabled={busy===inv.id} style={{flex:1,background:pal.accent,color:'#0B0B12',border:'none',borderRadius:8,padding:'8px 12px',fontSize:12,fontWeight:700,cursor:'pointer',opacity:busy===inv.id?0.5:1}}>Aceitar</button>
                <button onClick={()=>doReject(inv.id)} disabled={busy===inv.id} style={{flex:1,background:T.surface2,color:T.textSec,border:`1px solid ${T.border}`,borderRadius:8,padding:'8px 12px',fontSize:12,fontWeight:600,cursor:'pointer',opacity:busy===inv.id?0.5:1}}>Rejeitar</button>
              </div>
            </Card>
          ))}
        </div>
      </div>
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
  const [contaImovel, setContaImovel] = useState<ContaImovel[]>([])
  const [tab, setTab] = useState('familiar')
  const [showImport, setShowImport] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAllTxns, setShowAllTxns] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [me, setMe] = useState<Profile|null>(null)
  const [invites, setInvites] = useState<AccountInvite[]>([])
  const [showInvites, setShowInvites] = useState(false)
  const [membersAccountId, setMembersAccountId] = useState<string|null>(null)
  const [viewAllCategoria, setViewAllCategoria] = useState<string|undefined>(undefined)
  const [viewAllImovelId, setViewAllImovelId] = useState<string|undefined>(undefined)
  const [viewAllContaId, setViewAllContaId] = useState<string|undefined>(undefined)
  const [toast, setToast] = useState<string|null>(null)

  const openAllTxns = useCallback((categoria?:string, contaId?:string)=>{ setViewAllCategoria(categoria); setViewAllContaId(contaId); setShowAllTxns(true) },[])
  const showToast = useCallback((msg:string)=>{setToast(msg);setTimeout(()=>setToast(null),msg.length>60?5000:2500)},[])
  const load = useCallback(async()=>{
    const data = await loadAllData()
    setAccounts(data.accounts); setTransactions(data.transactions)
    setImoveis(data.imoveis); setContaImovel(data.contaImovel); setLoading(false)
  },[])
  const loadFull = useCallback(async()=>{ const all = await loadAllTransactions(); setAllTxns(all) },[])
  const refreshAll = useCallback(async()=>{ await load(); await loadFull() },[load,loadFull])

  const refreshInvites = useCallback(async()=>{ setInvites(await loadPendingInvites()) },[])
  const refreshMe = useCallback(async()=>{ setMe(await getCurrentProfile()) },[])

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{ setSession(session); if(session){load();loadFull();refreshMe();refreshInvites()} else setLoading(false) })
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_,session)=>{
      setSession(session)
      if(session){ load(); loadFull(); refreshMe(); refreshInvites(); countUnreadNotifications().then(setUnreadCount) }
      else { setLoading(false); setSession(null); setMe(null); setInvites([]) }
    })
    return ()=>subscription.unsubscribe()
  },[load,loadFull,refreshMe,refreshInvites])

  // Trata o regresso do fluxo OAuth da Google (?drive_connected=1 ou ?drive_error=...)
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search)
    if(params.get('drive_connected')) {
      showToast('✓ Google Drive ligado')
      window.history.replaceState({}, '', window.location.pathname)
    } else if(params.get('drive_error')) {
      const reason = params.get('drive_error') ?? 'desconhecido'
      showToast(`✗ Erro Drive: ${reason}`)
      window.history.replaceState({}, '', window.location.pathname)
    } else if(params.get('eb_connected')) {
      const bank = params.get('bank') ?? 'Banco'
      showToast(`✓ ${bank} ligado via Enable Banking`)
      window.history.replaceState({}, '', window.location.pathname)
    } else if(params.get('eb_error')) {
      showToast(`✗ Erro Enable Banking: ${params.get('eb_error')}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  },[showToast])

  const pal = PAL[tab]

  if(loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:T.bg,fontFamily:'system-ui'}}>
      <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:800,color:T.text,marginBottom:8}}>Finance<span style={{color:PAL.familiar.accent}}>.</span></div><div style={{fontSize:13,color:T.textSec}}>A carregar…</div></div>
    </div>
  )
  if(!session) return <LoginScreen onLogin={()=>{setLoading(true);load();loadFull()}}/>

  const screens:Record<string,React.ReactNode> = {
    familiar:   <BudgetScreen accounts={accounts} transactions={transactions} tag="familiar" pal={PAL.familiar} title="Conta Corrente Familiar" onViewAllTxns={openAllTxns} onRefresh={async()=>{await refreshAll();showToast('✓ Transação actualizada')}}/>,
    pessoal:    <BudgetScreen accounts={accounts} transactions={transactions} tag="pessoal"  pal={PAL.pessoal}  title="Conta Corrente Pessoal" onViewAllTxns={openAllTxns} onRefresh={async()=>{await refreshAll();showToast('✓ Transação actualizada')}}/>,
    imoveis:    <ImoveisScreen imoveis={imoveis} transactions={transactions} accounts={accounts} contaImovel={contaImovel} pal={PAL.imoveis} onRefresh={async()=>{await refreshAll();showToast('✓ Imóveis actualizados')}} onViewAll={(imovelId)=>{setViewAllImovelId(imovelId);openAllTxns()}}/>,
    patrimonio: <PatrimonioScreen accounts={accounts} imoveis={imoveis} transactions={transactions} pal={PAL.patrimonio}/>,
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',maxWidth:440,margin:'0 auto',background:T.bg,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",sans-serif',color:T.text}}>
      <div style={{flexShrink:0,background:T.surface,borderBottom:`1px solid ${T.border}`,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{fontSize:20,fontWeight:800,letterSpacing:'-0.03em'}}>Finance<span style={{color:pal.accent}}>.</span></div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setShowImport(true)} style={{background:pal.soft,border:'none',borderRadius:10,padding:'7px 12px',display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}><Upload size={13} color={pal.accent}/><span style={{fontSize:12,fontWeight:600,color:pal.accent}}>Importar</span></button>
          <button onClick={()=>{setShowNotifications(true);setUnreadCount(0)}} style={{background:T.surface2,border:'none',borderRadius:10,padding:'7px 10px',cursor:'pointer',position:'relative'}}>
            <Bell size={14} color={unreadCount>0?pal.accent:T.textSec}/>
            {unreadCount>0&&<span style={{position:'absolute',top:4,right:4,width:8,height:8,borderRadius:'50%',background:pal.accent,border:`2px solid ${T.surface2}`}}/>}
          </button>
          <button onClick={()=>{setShowSettings(true);refreshInvites()}} style={{background:T.surface2,border:'none',borderRadius:10,padding:'7px 10px',cursor:'pointer'}}><Settings size={14} color={T.textSec}/></button>
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'14px 12px 0'}}>{screens[tab]}<div style={{height:16}}/></div>
      <div style={{flexShrink:0,background:T.surface,borderTop:`1px solid ${T.border}`,display:'flex',padding:'8px 0 14px'}}>
        {TABS.map(({id,label,Icon})=>{const active=tab===id,c=active?PAL[id].accent:T.textTer;return (<button key={id} onClick={()=>setTab(id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3,background:'none',border:'none',cursor:'pointer',padding:'4px 0'}}><Icon size={20} color={c} strokeWidth={active?2.5:1.5}/><span style={{fontSize:10,fontWeight:active?700:400,color:c}}>{label}</span>{active&&<div style={{width:4,height:4,borderRadius:'50%',background:c}}/>}</button>)})}
      </div>
      {showImport&&<ImportWizard onClose={()=>setShowImport(false)} accounts={accounts} pal={pal} onDone={async()=>{await refreshAll();showToast('✓ Importação concluída')}} onRefreshAccounts={refreshAll}/>}
      {showSettings&&<SettingsPanel onClose={()=>setShowSettings(false)} accounts={accounts} onRefresh={async()=>{await refreshAll();showToast('✓ Dados actualizados')}} pal={pal} me={me} onMembers={(id)=>setMembersAccountId(id)} onShowInvites={()=>setShowInvites(true)} pendingInvitesCount={invites.length} onProfileUpdated={refreshMe}/>}
      {membersAccountId&&<MembersScreen accountId={membersAccountId} accounts={accounts} onClose={()=>setMembersAccountId(null)} pal={pal} onChanged={refreshAll}/>}
      {showInvites&&<InvitesScreen invites={invites} onClose={()=>setShowInvites(false)} pal={pal} onChanged={async()=>{await refreshInvites();await refreshAll()}}/>}
      {showAllTxns&&<AllTransactionsScreen allTxns={allTxns} accounts={accounts} tag={tab==='imoveis'?'investimento':tab} pal={pal} onClose={()=>{setShowAllTxns(false);setViewAllCategoria(undefined);setViewAllContaId(undefined);setViewAllImovelId(undefined)}} onRefresh={async()=>{await refreshAll();showToast('✓ Transações actualizadas')}} imoveis={tab==='imoveis'?imoveis:undefined} initialCategoria={viewAllCategoria} initialContaId={viewAllContaId} initialImovelId={viewAllImovelId}/>}
      {showNotifications&&<NotificationsScreen onClose={()=>setShowNotifications(false)} pal={pal}/>}
      {toast&&<div style={{position:'fixed',bottom:90,left:'50%',transform:'translateX(-50%)',background:T.surface,border:`1px solid ${pal.accent}`,borderRadius:12,padding:'10px 16px',display:'flex',alignItems:'flex-start',gap:8,zIndex:200,boxShadow:'0 8px 24px rgba(0,0,0,0.4)',width:'calc(100% - 32px)',maxWidth:400,boxSizing:'border-box'}}><Check size={15} color={pal.accent} style={{flexShrink:0,marginTop:1}}/><span style={{fontSize:13,fontWeight:600,color:T.text,wordBreak:'break-word'}}>{toast}</span></div>}
    </div>
  )
}

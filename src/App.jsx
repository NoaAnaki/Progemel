import { useState, useMemo } from "react";
import { CATEGORIES, getCategoriesForProduct, getFundsForCategory, classifyFund } from "./utils/classifier";
import { PRODUCT_LABELS, getAllFunds, calcAverages, sortFunds } from "./utils/dataLoader";

// ── Colour tokens ─────────────────────────────────────────────────────────────
const C = {
  crimson:'#8B1A3A', crimsonLt:'#B02248', dark:'#1A1A1A', darkMid:'#2C2C2C',
  mid:'#3D3D3D', muted:'#6B6B6B', border:'#E5E0DC', bg:'#F8F5F2',
  white:'#FFFFFF', pos:'#16A34A', neg:'#DC2626', avgBg:'#F5F0EA',
};

// Fix #4: Category display order by popularity
const BASE_ORDER = [
  'general','equities','bonds','israel','foreign',
  'forex','equitiesIsrael','equitiesForeign','bondsIsrael','bondsForeign',
  'illiquid','liquid','sp500',
];
const GEMEL_ORDER = [
  'gemel_under50','gemel_50_60','gemel_over60',
  'equities','bonds','israel','foreign',
  'forex','equitiesIsrael','equitiesForeign','bondsIsrael','bondsForeign',
  'illiquid','liquid','sp500',
];

const pctFmt    = v => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
const pctFmtRaw = v => v == null ? '—' : `${v.toFixed(1)}%`;
const numColor  = v => v == null ? C.dark : v >= 0 ? C.pos : C.neg;

// Fix #8: bonds = 100 - stocks - illiquid
function calcBonds(fund) {
  const s = fund.stocks ?? 0;
  const il = fund.illiquid ?? 0;
  return Math.max(0, Math.round((100 - s - il) * 10) / 10);
}

const TH = { padding:'8px 9px', fontSize:11, fontWeight:700, whiteSpace:'nowrap' };
const TD = { padding:'6px 9px', fontSize:12 };

// ── Tooltip ───────────────────────────────────────────────────────────────────
function Tooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position:'relative', display:'inline-flex', alignItems:'center' }}>
      <span onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        style={{
          width:13, height:13, borderRadius:'50%', background:'rgba(255,255,255,0.18)',
          color:'rgba(255,255,255,0.7)', fontSize:8, fontWeight:700,
          display:'inline-flex', alignItems:'center', justifyContent:'center',
          cursor:'help', marginRight:3, border:'1px solid rgba(255,255,255,0.3)',
        }}>?</span>
      {show && (
        <div style={{
          position:'absolute', bottom:'calc(100% + 6px)', right:0, width:210,
          background:C.dark, color:C.white, borderRadius:8, padding:'8px 12px',
          fontSize:11, lineHeight:1.6, zIndex:3000, boxShadow:'0 8px 24px rgba(0,0,0,0.4)',
          direction:'rtl', fontWeight:400, pointerEvents:'none',
        }}>{text}</div>
      )}
    </span>
  );
}

// ── Product Selector ──────────────────────────────────────────────────────────
function ProductSelector({ selected, onChange }) {
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
      {Object.entries(PRODUCT_LABELS).map(([key, { label, icon }]) => {
        const active = selected === key;
        return (
          <button key={key} onClick={() => onChange(key)} style={{
            display:'flex', alignItems:'center', gap:7, padding:'9px 16px',
            border:`2px solid ${active ? C.crimson : C.border}`,
            borderRadius:8, background: active ? C.crimson : C.white,
            color: active ? C.white : C.dark, cursor:'pointer',
            fontFamily:'inherit', fontSize:13, fontWeight:600,
            transition:'all 0.15s',
            boxShadow: active ? '0 3px 12px rgba(139,26,58,0.2)' : 'none',
          }}>
            <span style={{ fontSize:16 }}>{icon}</span>{label}
          </button>
        );
      })}
    </div>
  );
}

// Fix #3: Category Quick-Nav (scrolls to section, no filtering)
function CategoryNav({ catIds, funds }) {
  const scrollTo = id => {
    const el = document.getElementById(`sec-${id}`);
    if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
  };
  return (
    <div style={{
      display:'flex', gap:5, flexWrap:'wrap', padding:'9px 16px',
      background:C.white, borderBottom:`1px solid ${C.border}`,
      position:'sticky', top:60, zIndex:90,
    }}>
      {catIds.map(id => {
        const cnt = getFundsForCategory(funds, id).length;
        if (!cnt) return null;
        return (
          <button key={id} onClick={() => scrollTo(id)} style={{
            padding:'4px 11px', borderRadius:14,
            border:`1px solid ${C.border}`, background:C.white,
            color:C.mid, fontSize:11, fontWeight:600,
            cursor:'pointer', fontFamily:'inherit', transition:'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.crimson; e.currentTarget.style.color = C.crimson; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.mid; }}
          >{CATEGORIES[id].label}</button>
        );
      })}
    </div>
  );
}

// Fix #6: Bar chart (column-style bars per period, with category avg)
function ReturnBarChart({ fund, catAvg }) {
  const periods = [
    { key:'ret_month', label:'חודש' },
    { key:'ret_1y',    label:'שנה' },
    { key:'ret_3y',    label:'3 שנים' },
    { key:'ret_5y',    label:'5 שנים' },
  ].filter(p => fund[p.key] != null);

  if (!periods.length) return (
    <p style={{ textAlign:'center', color:C.muted, fontSize:11, margin:0 }}>אין נתוני תשואה</p>
  );

  const vals = periods.map(p => fund[p.key]);
  const avgVals = catAvg ? periods.map(p => catAvg[p.key]).filter(v => v != null) : [];
  const maxAbs = Math.max(...[...vals, ...avgVals].map(v => Math.abs(v)), 1);

  const W = 280, H = 110, PAD = 8, LABEL_H = 16;
  const barW = (W - PAD * 2) / periods.length - 6;
  const chartH = H - LABEL_H;
  const zeroY = PAD + chartH * (maxAbs / (maxAbs * 2));

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 6}`} style={{ display:'block', overflow:'visible' }}>
      {/* Zero line */}
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke={C.border} strokeWidth="1" />

      {periods.map((p, i) => {
        const val = fund[p.key];
        const barH = Math.max(2, Math.abs(val) / maxAbs * (chartH / 2 - 4));
        const x = PAD + i * ((W - PAD * 2) / periods.length) + 3;
        const y = val >= 0 ? zeroY - barH : zeroY;
        const color = val >= 0 ? C.pos : C.neg;
        const avg = catAvg?.[p.key];

        return (
          <g key={p.key}>
            {/* Bar */}
            <rect x={x} y={y} width={barW} height={barH} fill={color} rx="2" opacity="0.85" />
            {/* Value above/below bar */}
            <text
              x={x + barW / 2} y={val >= 0 ? y - 3 : y + barH + 10}
              textAnchor="middle" fontSize="9" fill={color} fontWeight="700"
              fontFamily="Assistant, Heebo, sans-serif">
              {pctFmt(val)}
            </text>
            {/* Category avg dot */}
            {avg != null && (() => {
              const avgBarH = Math.abs(avg) / maxAbs * (chartH / 2 - 4);
              const avgY = avg >= 0 ? zeroY - avgBarH : zeroY + avgBarH;
              return <circle cx={x + barW / 2} cy={avgY} r="3" fill={C.crimson} opacity="0.7" />;
            })()}
            {/* Period label */}
            <text x={x + barW / 2} y={H} textAnchor="middle" fontSize="9" fill={C.muted}
              fontFamily="Assistant, Heebo, sans-serif">{p.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Fund Detail Panel ─────────────────────────────────────────────────────────
function FundDetail({ fund, onClose, catAvg }) {
  if (!fund) return null;
  const cats  = classifyFund(fund).map(id => CATEGORIES[id]?.label).filter(Boolean);
  const bonds = calcBonds(fund);

  const Bar = ({ label, val, color }) => {
    if (val == null) return null;
    return (
      <div style={{ marginBottom:7 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
          <span style={{ fontSize:11, color:C.muted }}>{label}</span>
          <span style={{ fontSize:11, fontWeight:700, color: color || C.dark }}>{pctFmtRaw(val)}</span>
        </div>
        <div style={{ height:5, background:C.border, borderRadius:3 }}>
          <div style={{ height:5, borderRadius:3, width:`${Math.min(Math.abs(val),100)}%`, background: color || C.crimson }} />
        </div>
      </div>
    );
  };

  return (
    <div style={{
      width:340, height:'100%', background:C.white,
      boxShadow:'4px 0 28px rgba(0,0,0,0.14)',
      overflowY:'auto', direction:'rtl',
    }}>
      {/* Header */}
      <div style={{ background:C.crimson, padding:'14px 14px 12px', color:C.white }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <h2 style={{ margin:0, fontSize:12.5, fontWeight:700, lineHeight:1.5, flex:1, paddingLeft:8 }}>
            {fund.name}
          </h2>
          <button onClick={onClose} style={{
            background:'rgba(255,255,255,0.2)', border:'none', color:C.white,
            width:24, height:24, borderRadius:'50%', cursor:'pointer',
            fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          }}>×</button>
        </div>
        <div style={{ marginTop:7, display:'flex', gap:5, flexWrap:'wrap' }}>
          {cats.slice(0,3).map(c => (
            <span key={c} style={{ background:'rgba(255,255,255,0.2)', borderRadius:9, padding:'1px 8px', fontSize:9, fontWeight:600 }}>{c}</span>
          ))}
        </div>
      </div>

      <div style={{ padding:'12px 14px' }}>
        {/* Profit index */}
        <div style={{
          background:'linear-gradient(135deg,#FFF0F3,#FFE4EA)', border:`1px solid #F8C8D0`,
          borderRadius:9, padding:'9px 13px', marginBottom:12,
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <div>
            <div style={{ fontSize:11, color:C.crimson, fontWeight:700 }}>מדד פרופיט</div>
            <div style={{ fontSize:10, color:C.muted }}>שירות ואיכות ניהול</div>
          </div>
          <span style={{ fontSize:28, fontWeight:900, color:C.crimson }}>
            {fund.profit_index != null ? fund.profit_index.toFixed(1) : '—'}
          </span>
        </div>

        {/* Fix #6: Bar chart */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.dark, marginBottom:6 }}>
            גרף תשואות
            {catAvg && <span style={{ fontSize:10, color:C.muted, fontWeight:400, marginRight:6 }}>| עיגול = ממוצע קטגוריה</span>}
          </div>
          <div style={{ background:C.bg, borderRadius:8, padding:'10px 8px' }}>
            <ReturnBarChart fund={fund} catAvg={catAvg} />
          </div>
        </div>

        {/* Fix #8 + Fix #5: Exposures with bonds computed, no fees, forex always shown */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.dark, marginBottom:8 }}>הרכב החשיפות</div>
          <Bar label="מניות"             val={fund.stocks}   color="#2563EB" />
          <Bar label={'אג"ח (מחושב)'}    val={bonds}         color="#D97706" />
          <Bar label={'חו"ל'}            val={fund.foreign}  color="#7C3AED" />
          <Bar label={'מט"ח'}            val={fund.forex != null ? fund.forex : (fund.stocks != null && fund.foreign != null ? fund.foreign : null)} color="#059669" />
          <Bar label="לא סחיר"           val={fund.illiquid} color="#9CA3AF" />
          {fund.sharpe != null && (
            <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderTop:`1px solid ${C.border}`, marginTop:5 }}>
              <span style={{ fontSize:11, color:C.muted }}>מדד שארפ</span>
              <span style={{ fontSize:11, fontWeight:700 }}>{fund.sharpe.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* AI placeholder */}
        <div style={{ background:C.bg, border:`1.5px dashed ${C.border}`, borderRadius:9, padding:'11px 13px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
            <span style={{ fontSize:15 }}>🤖</span>
            <span style={{ fontSize:12, fontWeight:700, color:C.dark }}>ניתוח AI</span>
            <span style={{ fontSize:10, color:C.muted, background:C.border, borderRadius:8, padding:'1px 7px' }}>בקרוב</span>
          </div>
          <p style={{ margin:0, fontSize:11, color:C.muted, lineHeight:1.7 }}>
            כאן יופיע תיאור AI על הגוף המנהל, אסטרטגיית ניהול ההשקעות, וה"סיפור" של המוצר.
          </p>
        </div>
      </div>
    </div>
  );
}

// Fix #2: Sortable columns
const SORT_COLS = [
  { key:'ret_month', label:'חודש',     tip:'תשואה בחודש האחרון' },
  { key:'ret_1y',    label:'שנה',      tip:'תשואה מצטברת 12 חודשים' },
  { key:'ret_3y',    label:'3 שנים',   tip:'תשואה מצטברת 36 חודשים' },
  { key:'ret_5y',    label:'5 שנים',   tip:'תשואה מצטברת 60 חודשים' },
  { key:'profit_index', label:'מדד פרופיט', tip:'מדד שירות ואיכות ניהול — Profit Financial Group' },
];

function sortByKey(funds, key, dir) {
  return [...funds].sort((a, b) => {
    const av = a[key] ?? -Infinity, bv = b[key] ?? -Infinity;
    return dir === 'desc' ? bv - av : av - bv;
  });
}

// ── Fund Table (compact, always open) ────────────────────────────────────────
function FundTable({ funds, catId, onSelect, selFund }) {
  const [sortKey, setSortKey] = useState('profit_index');
  const [sortDir, setSortDir] = useState('desc');
  const [showAll, setShowAll] = useState(false);
  const cat = CATEGORIES[catId];

  const sorted  = useMemo(() => sortByKey(funds, sortKey, sortDir), [funds, sortKey, sortDir]);
  const top12   = sorted.slice(0, 12);
  const rest    = sorted.slice(12);
  const avg     = useMemo(() => calcAverages(sorted), [sorted]);

  function onSortClick(key) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortTh({ col }) {
    const active = sortKey === col.key;
    return (
      <th onClick={() => onSortClick(col.key)} style={{
        ...TH, textAlign:'center', cursor:'pointer', userSelect:'none',
        color: active ? '#FFD6DE' : 'rgba(255,255,255,0.8)',
        background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
      }}>
        <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:3 }}>
          <Tooltip text={col.tip} />
          {col.label}
          {active && <span style={{ fontSize:9 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>}
        </span>
      </th>
    );
  }

  function Row({ fund, rank }) {
    const isAvg = !!fund.isAverage;
    const isSel = !isAvg && selFund?.name === fund.name;
    return (
      <tr onClick={() => !isAvg && onSelect(fund)} style={{
        background: isAvg ? C.avgBg : isSel ? '#FFF0F3' : C.white,
        cursor: isAvg ? 'default' : 'pointer',
        borderBottom:`1px solid #F0EBE6`,
      }}
      onMouseEnter={e => { if (!isAvg && !isSel) e.currentTarget.style.background = '#FDF8F6'; }}
      onMouseLeave={e => { if (!isAvg && !isSel) e.currentTarget.style.background = C.white; }}
      >
        <td style={{ ...TD, color:C.muted, textAlign:'center', fontSize:10, width:26 }}>
          {isAvg ? '⌀' : rank}
        </td>
        <td style={{ ...TD, color: isSel ? C.crimson : isAvg ? C.dark : C.darkMid, fontWeight: isAvg ? 700 : 500 }}>
          <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:175 }} title={fund.name}>
            {fund.name}
          </div>
        </td>
        {SORT_COLS.map(col => (
          <td key={col.key} style={{
            ...TD, textAlign:'center',
            color: col.key === 'profit_index' ? C.crimson : numColor(fund[col.key]),
            fontWeight:600, fontVariantNumeric:'tabular-nums', fontSize:11.5,
            background: sortKey === col.key ? 'rgba(139,26,58,0.03)' : 'transparent',
          }}>
            {col.key === 'profit_index'
              ? (fund[col.key] != null ? fund[col.key].toFixed(1) : '—')
              : pctFmt(fund[col.key])}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <div id={`sec-${catId}`} style={{ marginBottom:24, scrollMarginTop:108 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:C.darkMid, borderRadius:'8px 8px 0 0' }}>
        <span style={{ fontSize:13, fontWeight:800, color:C.white }}>{cat?.label}</span>
        <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>{cat?.desc}</span>
        <span style={{ marginRight:'auto', fontSize:11, color:'rgba(255,255,255,0.35)' }}>{funds.length} מוצרים</span>
      </div>
      <div style={{ overflowX:'auto', border:`1px solid ${C.border}`, borderTop:'none', borderRadius:'0 0 8px 8px' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#2A2A2A' }}>
              <th style={{ ...TH, width:26, color:'rgba(255,255,255,0.4)' }}>#</th>
              <th style={{ ...TH, textAlign:'right', color:'rgba(255,255,255,0.8)', minWidth:155 }}>שם המוצר</th>
              {SORT_COLS.map(c => <SortTh key={c.key} col={c} />)}
            </tr>
          </thead>
          <tbody>
            {top12.map((f, i) => <Row key={f.name} fund={f} rank={i + 1} />)}
            <Row fund={avg} rank={null} />
          </tbody>
        </table>
      </div>
      {rest.length > 0 && (
        <>
          <button onClick={() => setShowAll(!showAll)} style={{
            background:'transparent', border:'none', color:C.crimson,
            fontSize:11.5, cursor:'pointer', fontFamily:'inherit', fontWeight:600,
            display:'flex', alignItems:'center', gap:5, padding:'5px 2px',
          }}>
            {showAll ? '▲ הסתר' : `▼ הצג עוד ${rest.length} מוצרים`}
          </button>
          {showAll && (
            <div style={{ overflowX:'auto', border:`1px solid ${C.border}`, borderRadius:8 }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <tbody>{rest.map((f, i) => <Row key={f.name} fund={f} rank={13 + i} />)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [product, setProduct] = useState('השתלמות');
  const [selFund, setSelFund] = useState(null);

  const funds  = useMemo(() => getAllFunds(product), [product]);
  const order  = product === 'גמל' ? GEMEL_ORDER : BASE_ORDER;
  const catIds = useMemo(() => order.filter(id => getFundsForCategory(funds, id).length > 0), [funds, order]);

  // Find category avg for selected fund
  const selCatId = useMemo(() => {
    if (!selFund) return null;
    const fc = classifyFund(selFund);
    return order.find(id => fc.includes(id) && getFundsForCategory(funds, id).length > 0) ?? null;
  }, [selFund, funds, order]);

  const catAvg = useMemo(() =>
    selCatId ? calcAverages(getFundsForCategory(funds, selCatId)) : null,
    [selCatId, funds]
  );

  const panelOpen = selFund !== null;

  return (
    <div style={{ minHeight:'100vh', background:C.bg, fontFamily:"'Assistant','Heebo',Arial,sans-serif", direction:'rtl' }}>
      {/* Nav */}
      <nav style={{
        background:C.dark, padding:'0 18px', display:'flex', alignItems:'center',
        justifyContent:'space-between', height:60, position:'sticky', top:0, zIndex:100,
        boxShadow:'0 2px 10px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <div style={{
            width:30, height:30, borderRadius:6,
            background:`linear-gradient(135deg,${C.crimson},${C.crimsonLt})`,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontWeight:900, color:C.white, fontSize:11,
          }}>PG</div>
          <div>
            <div style={{ color:C.white, fontWeight:800, fontSize:15, lineHeight:1 }}>ProGemel</div>
            <div style={{ color:C.muted, fontSize:9, letterSpacing:'0.08em' }}>PROFIT FINANCIAL GROUP</div>
          </div>
        </div>
        <div style={{ color:C.muted, fontSize:11 }}>נתונים: {new Date().toLocaleDateString('he-IL')}</div>
      </nav>

      {/* Split layout */}
      <div style={{ display:'flex', minHeight:'calc(100vh - 60px)' }}>

        {/* LEFT panel (sticky) — Fix #1 */}
        <div style={{
          width: panelOpen ? 340 : 0, flexShrink:0,
          transition:'width 0.25s ease', overflow:'hidden',
          position:'sticky', top:60, height:'calc(100vh - 60px)', alignSelf:'flex-start',
        }}>
          {panelOpen && <FundDetail fund={selFund} onClose={() => setSelFund(null)} catAvg={catAvg} />}
        </div>

        {/* RIGHT — tables column */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>

          {/* Product selector */}
          <div style={{ padding:'14px 18px 12px', background:C.white, borderBottom:`1px solid ${C.border}` }}>
            <ProductSelector selected={product} onChange={k => { setProduct(k); setSelFund(null); }} />
          </div>

          {/* Quick-nav — Fix #3 */}
          <CategoryNav catIds={catIds} funds={funds} />

          {/* All tables open — Fix #3 + Fix #4 */}
          <div style={{ padding:'18px 18px 48px' }}>
            {catIds.map(id => (
              <FundTable key={`${product}-${id}`} catId={id}
                funds={getFundsForCategory(funds, id)}
                onSelect={setSelFund} selFund={selFund} />
            ))}
          </div>

          <footer style={{
            background:C.dark, color:'rgba(255,255,255,0.3)',
            textAlign:'center', padding:'14px', fontSize:11,
          }}>
            © {new Date().getFullYear()} Profit Financial Group · הנתונים לצורך מידע בלבד ואינם מהווים ייעוץ השקעות
          </footer>
        </div>
      </div>
    </div>
  );
}

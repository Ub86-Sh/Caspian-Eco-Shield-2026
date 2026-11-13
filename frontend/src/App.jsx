import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const API = ''
const TYPES = { boat: 'Браконьерский катер', gunshot: 'Выстрел', spill: 'Сброс / аномалия' }
const NAV = [
  ['home', 'Главная'], ['map', 'Карта мониторинга'], ['migration', 'Миграция животных'],
  ['audio', 'Акустический анализ'], ['water', 'Водная аналитика'],
  ['incidents', 'Инциденты'], ['settings', 'Настройки'],
]
const GOLD = '#D8C66A', WATER = '#83B7AC'
const riskColor = r => (r > 0.7 ? '#E5604D' : r > 0.4 ? '#D8C66A' : '#83B7AC')
const dot = c => L.divIcon({ className: '', html: `<div class="dot ${c}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] })
const CITIES = [['Астрахань', 46.35, 48.04], ['Махачкала', 42.98, 47.5], ['Атырау', 47.11, 51.92], ['Актау', 43.65, 51.15], ['Баку', 40.41, 49.87]]
const SIGHTINGS = [[44.45, 47.45], [44.5, 47.6], [44.3, 47.35], [44.7, 47.2], [44.9, 46.9], [45.1, 47.0], [44.6, 47.75]]
const ROUTES = [[[44.4, 47.5], [44.8, 47.1], [45.3, 47.4], [45.7, 48.2]], [[44.4, 47.5], [43.9, 47.7], [43.4, 47.6]]]
const FORECAST = [[45.7, 48.2], [46.0, 48.6], [46.2, 49.0]]
const RECORDS = [
  { id: 1, name: 'Буй «о. Тюлений» · 02:14', type: 'boat', label: 'Браконьерский катер', conf: 94 },
  { id: 2, name: 'Буй «Дельта Волги-1» · 05:40', type: 'wave', label: 'Шум волн / норма', conf: 88 },
  { id: 3, name: 'Буй «Кизлярский залив» · 07:05', type: 'gunshot', label: 'Выстрел', conf: 91 },
]
const SEASON = [20, 28, 35, 55, 78, 90, 70, 52, 40, 33, 25, 18]

const seeded = s => () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
const series = (seed, base, amp, n = 24) => { const r = seeded(seed); let v = base; return Array.from({ length: n }, () => (v += (r() - 0.5) * amp, +v.toFixed(2))) }

function play(type) {
  const C = window.AudioContext || window.webkitAudioContext
  const ctx = new C(), g = ctx.createGain(); g.connect(ctx.destination)
  const t = ctx.currentTime
  if (type === 'gunshot') {
    const len = ctx.sampleRate * 0.4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12))
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(g); g.gain.value = 0.8; s.start()
  } else {
    const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain()
    o.type = type === 'boat' ? 'sawtooth' : 'sine'
    o.frequency.value = type === 'boat' ? 85 : 220
    lfo.frequency.value = type === 'boat' ? 14 : 0.5
    lg.gain.value = type === 'boat' ? 20 : 30
    lfo.connect(lg); lg.connect(o.frequency)
    g.gain.setValueAtTime(type === 'boat' ? 0.25 : 0.08, t); g.gain.linearRampToValueAtTime(0, t + 3)
    o.connect(g); o.start(t); lfo.start(t); o.stop(t + 3); lfo.stop(t + 3)
  }
}

function Count({ v }) {
  const [x, setX] = useState(v)
  const ref = useRef(v)
  useEffect(() => {
    const from = typeof ref.current === 'number' ? ref.current : v
    const t0 = performance.now()
    let raf
    const step = t => {
      const k = Math.min(1, (t - t0) / 500)
      const val = from + (v - from) * k
      setX(Number.isInteger(v) ? Math.round(val) : +val.toFixed(1))
      if (k < 1) raf = requestAnimationFrame(step); else ref.current = v
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [v])
  return <>{x}</>
}

function Card({ title, right, cls = '', children }) {
  return <div className={'card ' + cls}>{title && <div className="ct"><span>{title}</span>{right}</div>}{children}</div>
}
function Stat({ label, value, unit, sub, cls }) {
  return <Card title={label} cls={cls}><div className="big">{typeof value === 'number' ? <Count v={value} /> : value}{unit && <small> {unit}</small>}</div>{sub && <div className="sub">{sub}</div>}</Card>
}
function Chart({ data, color = '#48543A', h = 110 }) {
  const w = 320, mn = Math.min(...data), mx = Math.max(...data), r = mx - mn || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 8 - ((v - mn) / r) * (h - 24)}`)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" preserveAspectRatio="none">
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={color} opacity=".2" />
      <polyline points={pts.join(' ')} pathLength="1" className="draw" fill="none" stroke={color} strokeWidth="2.5" />

    </svg>
  )
}
function Wave({ seed, type, crit }) {
  const r = seeded(seed)
  return (
    <div className="wave">
      {Array.from({ length: 90 }, (_, i) => {
        const env = type === 'gunshot' ? Math.exp(-Math.abs(i - 30) / 6) : type === 'boat' ? 0.5 + 0.4 * Math.sin(i / 4) : 0.25 + 0.15 * Math.sin(i / 9)
        return <i key={i} style={{ height: Math.max(4, env * (0.5 + r()) * 100) + '%', background: crit ? '#E5604D' : '#83B7AC' }} />
      })}
    </div>
  )
}

function MapView({ data, layers, onPick, focus, center = [44.5, 47.8], zoom = 6 }) {
  const el = useRef(null), map = useRef(null), grp = useRef({})
  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: false }).setView(center, zoom)
L.control.attribution({ prefix: false }).addTo(m)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri', maxZoom: 12 }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    CITIES.forEach(([n, a, b]) => L.marker([a, b], { icon: L.divIcon({ className: '', html: `<div class="city">● ${n}</div>`, iconSize: [90, 14] }), interactive: false }).addTo(m))
    L.marker([41.9, 50.8], { icon: L.divIcon({ className: '', html: '<div class="sea-l">КАСПИЙСКОЕ МОРЕ</div>', iconSize: [220, 20] }), interactive: false }).addTo(m)
    grp.current = { zones: L.layerGroup().addTo(m), buoys: L.layerGroup().addTo(m), incidents: L.layerGroup().addTo(m), animals: L.layerGroup().addTo(m) }
    map.current = m
    setTimeout(() => m.invalidateSize(), 100)
    return () => m.remove()
  }, [])
  useEffect(() => {
    const g = grp.current
    if (!data || !g.zones) return
    Object.values(g).forEach(x => x.clearLayers())
    if (layers.zones) data.risk_zones.forEach(z => L.polygon(z.polygon, { color: riskColor(z.risk), weight: 1.5, fillOpacity: 0.3 }).on('click', () => onPick && onPick({ kind: 'zone', obj: z })).addTo(g.zones))
    if (layers.buoys) data.buoys.forEach(b => L.marker([b.lat, b.lon], { icon: dot(b.status === 'critical' ? 'crit' : 'ok') }).bindTooltip(`${b.name}: ${b.temp}°C, ${b.salinity}‰`, { direction: 'top', offset: [0, -8] }).on('click', () => onPick && onPick({ kind: 'buoy', obj: b })).addTo(g.buoys))
    if (layers.incidents) data.incidents.forEach(i => L.marker([i.lat, i.lon], { icon: dot('inc') }).on('click', () => onPick && onPick({ kind: 'incident', obj: i })).addTo(g.incidents))
    if (layers.animals) {
      SIGHTINGS.forEach(p => L.circleMarker(p, { radius: 5, color: GOLD, fillColor: GOLD, fillOpacity: 0.9, weight: 1 }).addTo(g.animals))
      ROUTES.forEach(r => L.polyline(r, { color: WATER, weight: 3 }).addTo(g.animals))
      L.polyline(FORECAST, { color: GOLD, weight: 3, dashArray: '8 8' }).addTo(g.animals)
    }
  }, [data, layers])
  useEffect(() => { if (focus && map.current) map.current.flyTo([focus.lat, focus.lon], 9) }, [focus])
  return <div className="mapbox" ref={el} />
}

export default function App() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [tab, setTab] = useState('home')
  const [selId, setSelId] = useState(null)
  const [pick, setPick] = useState(null)
  const [layers, setLayers] = useState({ buoys: true, zones: true, incidents: true, animals: false })
  const [rec, setRec] = useState(RECORDS[0])
  const [audio, setAudio] = useState(null)
  const [busy, setBusy] = useState(false)
  const [fStatus, setFStatus] = useState('all')
  const [fType, setFType] = useState('all')
  const [prefs, setPrefs] = useState({ push: true, sound: true, sms: false, zones: true, labels: true })
  
  const [toasts, setToasts] = useState([])
const [loading, setLoading] = useState('')
const prevId = useRef(null)
const toast = (msg, kind = 'ok') => {
  const id = Date.now() + Math.random()
  setToasts(t => [...t, { id, msg, kind }])
  setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
}

  async function load() {
    try { const r = await fetch(API + '/api/state'); setData(await r.json()); setErr(false) } catch { setErr(true) }
  }
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t) }, [])

  useEffect(() => {
  if (!data) return
  const top = data.incidents[0]?.id
  if (prevId.current !== null && top && top !== prevId.current) toast('Новое событие: ' + (TYPES[data.incidents[0].type] || 'инцидент'), 'err')
  prevId.current = top ?? 0
}, [data])

  const simulate = async () => {
  setLoading('sim')
  try { await fetch(API + '/api/simulate', { method: 'POST' }); await load() }
  catch { toast('Нет связи с сервером', 'err') }
  setLoading('')
}
const dispatch = async id => {
  try { await fetch(`${API}/api/incidents/${id}/dispatch`, { method: 'POST' }); await load(); toast('Патруль направлен') }
  catch { toast('Не удалось направить патруль', 'err') }
}

  async function upload(e) {
    const f = e.target.files[0]; if (!f) return
    setBusy(true)
    const fd = new FormData(); fd.append('file', f)
    try {
      const r = await fetch(API + '/api/analyze-audio', { method: 'POST', body: fd })
      if (!r.ok) throw new Error()
      setAudio(await r.json()); load()
    } catch { setAudio({ error: 'Не удалось проанализировать файл' }) }
    setBusy(false); e.target.value = ''
  }
  const openInc = i => { setSelId(i.id); setTab('incidents') }

  const incs = data?.incidents || []
  const buoys = data?.buoys || []
  const zones = data?.risk_zones || []
  const newCount = incs.filter(i => i.status === 'Новый').length
  const sel = incs.find(i => i.id === selId)
  const hydro = data?.hydrology
  const title = NAV.find(n => n[0] === tab)[1]
  const list = incs.filter(i => (fStatus === 'all' || i.status === fStatus) && (fType === 'all' || i.type === fType))

  const IncCard = i => (
    <div key={i.id} className={`ev ${i.priority === 'high' ? 'high' : ''} ${i.id === selId ? 'sel' : ''}`} onClick={() => openInc(i)}>
      <div>{TYPES[i.type]} {i.risk_zone && <span className="tag crit">в зоне риска</span>}<small>{i.message}</small></div>
      <small>{i.time.slice(11)}</small>
    </div>
  )

  return (
    <div className="app">
      <div className="toasts">{toasts.map(t => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}</div>
      <aside className="side">
        <div className="logo"> Эко-Щит Каспия<small>Помощник инспектора ООПТ</small></div>
        {NAV.map(([k, n]) => <button key={k} className={'nav ' + (tab === k ? 'on' : '')} onClick={() => setTab(k)}>{n}</button>)}
      </aside>

      <div className="col">
        <div className="top">
          <h1>{title}</h1><span className="sp" />
          <span className={'conn ' + (err ? 'bad' : '')}>{err ? ' нет связи с сервером' : ` ${buoys.length} буев онлайн`}</span>
          <input className="search" placeholder="Поиск по системе…" />
          <button className="bell" data-tip="Уведомления" onClick={() => setTab('incidents')}>🔔{newCount > 0 && <b>{newCount}</b>}</button>
          <div className="me"><i>И</i><div>Инспектор<br /><span className="hint">Дагестанский заповедник</span></div></div>
        </div>

        <div key={tab} className={'content page ' + (tab === 'map' ? 'flush ' : '') + (!data && !err ? 'loading' : '')}>

          {tab === 'home' && (<>
            <div className="g4">
              <Stat label="Активные угрозы" value={newCount} sub="требуют реакции" cls={newCount ? 'dark' : ''} />
              <Stat label="Датчики и буи" value={buoys.length} sub={`тревога: ${buoys.filter(b => b.status === 'critical').length}`} />
              <Stat label="Всего инцидентов" value={incs.length} sub="за текущую сессию" />
              <Stat label="Зоны высокого риска" value={zones.filter(z => z.risk > 0.7).length} sub={`из ${zones.length}`} />
            </div>
            <div className="g2">
              <Card title="Последние события" right={<button className="btn alt" onClick={simulate} data-load={loading === 'sim' ? '1' : undefined}>Симуляция тревоги</button>}>
                {incs.length === 0 && <div className="sub">Тревог нет. Нажмите «Симуляция тревоги».</div>}
                {incs.slice(0, 5).map(IncCard)}
              </Card>
              <Card title="Обзор карты"><div className="mini"><MapView data={data} layers={{ buoys: true, zones: true, incidents: true, animals: false }} /></div></Card>
            </div>
            <div className="g3 mt">
              <Stat label="Температура воды" value={hydro?.avg_temp ?? '–'} unit="°C" />
              <Stat label="Солёность" value={hydro?.avg_salinity ?? '–'} unit="‰" />
              <Stat label="Уровень моря" value={hydro?.sea_level ?? '–'} unit="м" />
            </div>
          </>)}

          {tab === 'map' && (
            <div className="mapscreen">
              <MapView data={data} layers={layers} onPick={setPick} focus={pick?.obj?.lat ? pick.obj : null} />
              <div className="ov l">
                <h4>Слои</h4>
                {[['buoys', 'Датчики и буи'], ['zones', 'Охраняемые зоны'], ['animals', 'Животные'], ['incidents', 'Инциденты']].map(([k, n]) => (
                  <label key={k}><input type="checkbox" checked={layers[k]} onChange={() => setLayers(l => ({ ...l, [k]: !l[k] }))} />{n}</label>
                ))}
                <button className="btn" style={{ width: '100%', marginTop: 6 }} onClick={simulate} data-load={loading === 'sim' ? '1' : undefined}>Симуляция тревоги</button>
              </div>
              <div className="ov r" key={pick?.obj?.id ?? 'none'}>
                <h4>Выбранный объект</h4>
                {!pick && <div className="hint">Нажмите на маркер или зону на карте.</div>}
                {pick?.kind === 'buoy' && <div><b>{pick.obj.name}</b><br />Вода: {pick.obj.temp}°C<br />Солёность: {pick.obj.salinity}‰<br />Статус: {pick.obj.status === 'critical' ? ' тревога' : ' норма'}</div>}
                {pick?.kind === 'zone' && <div><b>{pick.obj.name}</b><br />Риск: {Math.round(pick.obj.risk * 100)}%<br /><span className="hint">{pick.obj.reason}</span></div>}
                {pick?.kind === 'incident' && <div><b>{TYPES[pick.obj.type]}</b><br />{pick.obj.message}<br />Статус: {pick.obj.status}<br /><button className="btn" style={{ marginTop: 8 }} onClick={() => openInc(pick.obj)}>Открыть инцидент</button></div>}
              </div>
            </div>
          )}

          {tab === 'migration' && (
            <div className="g2" style={{ marginTop: 0, gridTemplateColumns: '1.6fr 1fr' }}>
              <Card title="Миграция каспийского тюленя" right={<span className="hint">точки — наблюдения, сплошная — маршруты, пунктир — прогноз</span>}>
                <div style={{ height: 520 }}><MapView data={data} layers={{ buoys: false, zones: true, incidents: false, animals: true }} center={[44.8, 47.8]} zoom={7} /></div>
              </Card>
              <div className="stack">
                <Card title="Сезонная активность, %"><Chart data={SEASON} color="#D97B50" /><div className="sub">янв → дек (демо-данные)</div></Card>
                <Stat label="Наблюдений за 7 дней" value="42" sub="демо-данные" />
                <Stat label="Прогноз перехода в зону нереста" value="78" unit="%" sub="по модели риска" cls="dark" />
                <Stat label="Риск беспокойства животных" value="Средний" sub="рядом с маршрутом зафиксирован катер" />
              </div>
            </div>
          )}

          {tab === 'audio' && (
            <div className="g2" style={{ marginTop: 0 }}>
              <Card title="Аудиозаписи с буёв">
                {RECORDS.map(r => (
                  <div key={r.id} className={`ev ${r.type !== 'wave' ? 'high' : ''} ${rec.id === r.id ? 'sel' : ''}`} onClick={() => setRec(r)}>
                    <div>{r.name}<small>{r.label} · {r.conf}%</small></div>{r.type !== 'wave' && <span className="tag crit">угроза</span>}
                  </div>
                ))}
                <div className="mt"><b style={{ fontSize: 13 }}>Загрузить свой файл (.wav / .mp3)</b><br /><input type="file" accept=".wav,.mp3" onChange={upload} disabled={busy} /></div>
                {busy && <div className="sub">Анализ…</div>}
                {audio?.error && <div className="sub">{audio.error}</div>}
                {audio?.label && (
                  <div className="mt">
                    <span className={'tag ' + (audio.label === 'Шум волн/Норма' ? 'ok' : 'crit')}>{audio.label} · {audio.confidence}%</span>
                    <div className="bars">{audio.spectrum.map((v, i) => <i key={i} style={{ height: Math.max(4, v * 100) + '%' }} />)}</div>
                  </div>
                )}
              </Card>
              <Card title="Анализ записи" cls={rec.type !== 'wave' ? '' : ''}>
                <b>{rec.name}</b>
                <Wave seed={rec.id * 7} type={rec.type} crit={rec.type !== 'wave'} />
                <div className="row"><button className="btn" onClick={() => play(rec.type)}>▶ Воспроизвести</button></div>
                <div className="mt">Результат ИИ: <span className={'tag ' + (rec.type !== 'wave' ? 'crit' : 'ok')}>{rec.label}</span><div className="sub">Уверенность: {rec.conf}%. {rec.type !== 'wave' ? 'Подозрительная активность — рекомендуется проверка.' : 'Нарушений не обнаружено.'}</div></div>
              </Card>
            </div>
          )}

          {tab === 'water' && (<>
            <div className="g3">
              <Stat label="Температура воды" value={hydro?.avg_temp ?? '–'} unit="°C" sub="среднее по буям" />
              <Stat label="Солёность" value={hydro?.avg_salinity ?? '–'} unit="‰" sub="среднее по буям" />
              <Stat label="Уровень моря" value={hydro?.sea_level ?? '–'} unit="м" sub="Балтийская система" cls="dark" />
            </div>
            <div className="g3 mt">
              <Card title="Температура, 24 ч"><Chart data={series(3, 14, 0.6)} color="#D97B50" /></Card>
              <Card title="Солёность, 24 ч"><Chart data={series(8, 8, 0.5)} color="#48543A" /></Card>
              <Card title="Уровень, 24 ч"><Chart data={series(5, -28.3, 0.05)} color="#5b9d90" /></Card>
            </div>
            <Card title="Датчики" cls="mt">
              <table className="tbl"><thead><tr><th>Буй</th><th>Вода, °C</th><th>Солёность, ‰</th><th>Статус</th></tr></thead>
                <tbody>{buoys.map(b => <tr key={b.id}><td>{b.name}</td><td>{b.temp}</td><td>{b.salinity}</td><td><span className={'tag ' + (b.status === 'critical' ? 'crit' : 'ok')}>{b.status === 'critical' ? 'тревога' : 'норма'}</span></td></tr>)}</tbody></table>
            </Card>
          </>)}

          {tab === 'incidents' && (
            <div className="g2" style={{ marginTop: 0, gridTemplateColumns: '1.5fr 1fr' }}>
              <Card title="Журнал происшествий" right={<button className="btn" onClick={simulate} data-load={loading === 'sim' ? '1' : undefined}>+ Создать инцидент</button>}>
                <div className="row" style={{ marginBottom: 10 }}>
                  <select value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="all">Все статусы</option><option>Новый</option><option>Патруль направлен</option></select>
                  <select value={fType} onChange={e => setFType(e.target.value)}><option value="all">Все типы</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </div>
                <table className="tbl"><thead><tr><th>Время</th><th>Тип</th><th>Место</th><th>Приоритет</th><th>Статус</th></tr></thead>
                  <tbody>{list.map(i => (
                    <tr key={i.id} className="rw" onClick={() => setSelId(i.id)}>
                      <td>{i.time.slice(11)}</td><td>{TYPES[i.type]}</td><td>{i.lat}, {i.lon}</td>
                      <td><span className={'tag ' + (i.priority === 'high' ? 'crit' : '')}>{i.priority === 'high' ? 'высокий' : 'средний'}</span></td><td>{i.status}</td>
                    </tr>))}</tbody></table>
                {list.length === 0 && <div className="sub">Нет инцидентов. Нажмите «Создать инцидент».</div>}
              </Card>
              <Card title="Детали инцидента">
                {!sel && <div className="sub">Выберите строку в таблице.</div>}
                {sel && (<>
                  <b style={{ fontSize: 18 }}>{TYPES[sel.type]} №{sel.id}</b>
                  <div className="sub">{sel.message}</div>
                  <div className="mt">Точность ИИ: <b>{Math.round(sel.confidence * 100)}%</b><br />Приоритет: <b>{sel.priority === 'high' ? 'ВЫСОКИЙ' : 'средний'}</b><br />{sel.risk_zone ? <span className="tag crit"> внутри зоны риска</span> : 'Вне зон риска'}<br />Статус: {sel.status}</div>
                  <Wave seed={sel.id * 11} type={sel.type} crit />
                  <div className="row">
                    <button className="btn alt" onClick={() => play(sel.type)}>▶ Прослушать</button>
                    <button className="btn" disabled={sel.status === 'Патруль направлен'} onClick={() => dispatch(sel.id)}>{sel.status === 'Патруль направлен' ? 'Патруль в пути' : 'Направить патруль'}</button>
                  </div>
                </>)}
              </Card>
            </div>
          )}

          {tab === 'settings' && (
            <div className="g3" style={{ marginTop: 0 }}>
              <Card title="Профиль инспектора">
                <div className="sw">Должность<b>Инспектор ООПТ</b></div>
                <div className="sw">Территория<b>Дагестанский заповедник</b></div>
                <div className="sw">Смена<b>Дневная</b></div>
              </Card>
              <Card title="Уведомления">
                {[['push', 'Push-уведомления'], ['sound', 'Звук тревоги'], ['sms', 'SMS при критической угрозе']].map(([k, n]) => (
                  <div className="sw" key={k}>{n}<input type="checkbox" checked={prefs[k]} onChange={() => setPrefs(p => ({ ...p, [k]: !p[k] }))} /></div>
                ))}
              </Card>
              <Card title="Карта и система">
                {[['zones', 'Показывать зоны риска'], ['labels', 'Подписи городов']].map(([k, n]) => (
                  <div className="sw" key={k}>{n}<input type="checkbox" checked={prefs[k]} onChange={() => setPrefs(p => ({ ...p, [k]: !p[k] }))} /></div>
                ))}
                <div className="sw">Обновление данных<b>3 сек</b></div>
              </Card>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

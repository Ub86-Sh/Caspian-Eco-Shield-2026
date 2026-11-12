import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const API = 'http://localhost:8000'
const TYPES = { boat: 'Браконьерский катер', gunshot: 'Выстрел', spill: 'Сброс / аномалия' }
const riskColor = r => (r > 0.7 ? '#f43f5e' : r > 0.4 ? '#f59e0b' : '#10b981')
const dot = cls => L.divIcon({ className: '', html: `<div class="dot ${cls}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] })

function fakeSpectrum(inc) {
  let s = inc.id * 9301 + 49297
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
  return Array.from({ length: 32 }, (_, i) => {
    const base = inc.type === 'boat' ? Math.exp(-i / 8) : inc.type === 'gunshot' ? 0.35 + 0.4 * (i / 32) : 0.5 * Math.exp(-((i - 16) ** 2) / 60)
    return Math.min(1, base * (0.6 + 0.6 * rnd()))
  })
}

function play(type) {
  const C = window.AudioContext || window.webkitAudioContext
  const ctx = new C()
  const g = ctx.createGain()
  g.connect(ctx.destination)
  const t = ctx.currentTime
  if (type === 'gunshot') {
    const len = ctx.sampleRate * 0.4
    const b = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12))
    const s = ctx.createBufferSource()
    s.buffer = b
    s.connect(g)
    g.gain.value = 0.8
    s.start()
  } else {
    const o = ctx.createOscillator()
    o.type = type === 'boat' ? 'sawtooth' : 'sine'
    o.frequency.value = type === 'boat' ? 85 : 600
    const lfo = ctx.createOscillator()
    lfo.frequency.value = type === 'boat' ? 14 : 4
    const lg = ctx.createGain()
    lg.gain.value = type === 'boat' ? 20 : 0
    lfo.connect(lg)
    lg.connect(o.frequency)
    g.gain.setValueAtTime(0.25, t)
    g.gain.linearRampToValueAtTime(0, t + 3)
    o.connect(g)
    o.start(t); lfo.start(t); o.stop(t + 3); lfo.stop(t + 3)
  }
}

export default function App() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [selId, setSelId] = useState(null)
  const [showZones, setShowZones] = useState(true)
  const [audio, setAudio] = useState(null)
  const [busy, setBusy] = useState(false)
  const divRef = useRef(null)
  const mapRef = useRef(null)
  const layers = useRef({})

  async function load() {
    try {
      const r = await fetch(API + '/api/state')
      setData(await r.json())
      setErr(false)
    } catch { setErr(true) }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const map = L.map(divRef.current).setView([44.5, 47.8], 6)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
    }).addTo(map)
    layers.current = { zones: L.layerGroup().addTo(map), buoys: L.layerGroup().addTo(map), inc: L.layerGroup().addTo(map) }
    mapRef.current = map
    return () => map.remove()
  }, [])

  function select(inc) {
    setSelId(inc.id)
    mapRef.current?.flyTo([inc.lat, inc.lon], 9)
  }

  useEffect(() => {
    if (!data || !mapRef.current) return
    const { zones, buoys, inc } = layers.current
    zones.clearLayers(); buoys.clearLayers(); inc.clearLayers()
    if (showZones) {
      data.risk_zones.forEach(z => {
        L.polygon(z.polygon, { color: riskColor(z.risk), weight: 1, fillOpacity: 0.3 })
          .bindPopup(`<b>${z.name}</b><br>Риск: ${Math.round(z.risk * 100)}%<br>${z.reason}`)
          .addTo(zones)
      })
    }
    data.buoys.forEach(b => {
      L.marker([b.lat, b.lon], { icon: dot(b.status === 'critical' ? 'crit' : 'ok') })
        .bindPopup(`<b>${b.name}</b><br>Темп.: ${b.temp}°C<br>Солёность: ${b.salinity}‰`)
        .addTo(buoys)
    })
    data.incidents.forEach(i => {
      L.marker([i.lat, i.lon], { icon: dot('inc') })
        .on('click', () => select(i))
        .addTo(inc)
    })
  }, [data, showZones])

  async function simulate() {
    await fetch(API + '/api/simulate', { method: 'POST' })
    await load()
  }

  async function dispatch(id) {
    await fetch(`${API}/api/incidents/${id}/dispatch`, { method: 'POST' })
    await load()
  }

  async function uploadAudio(e) {
    const f = e.target.files[0]
    if (!f) return
    setBusy(true)
    const fd = new FormData()
    fd.append('file', f)
    try {
      const r = await fetch(API + '/api/analyze-audio', { method: 'POST', body: fd })
      if (!r.ok) throw new Error()
      setAudio(await r.json())
    } catch { setAudio({ error: 'Не удалось проанализировать файл' }) }
    setBusy(false)
    e.target.value = ''
  }

  const sel = data?.incidents.find(i => i.id === selId)
  const crit = data?.buoys.filter(b => b.status === 'critical').length || 0

  return (
    <>
      <div className="top">
        <span className="logo">🛡 Эко-Щит Каспия</span>
        <span className="badge">
          {err ? '⚠ нет связи с сервером' : `${data?.buoys.length ?? 0} буев онлайн · тревог: ${crit}`}
        </span>
        <span className="spacer" />
        <button className="btn" onClick={() => setShowZones(s => !s)}>
          {showZones ? 'Скрыть' : 'Показать'} прогноз (тюлень / нерест)
        </button>
        <button className="btn danger" onClick={simulate}>Симуляция тревоги (Demo)</button>
      </div>

      <div className="main">
        <div className="panel left">
          <div className="card">
            <h3>Гидрология</h3>
            <div className="hydro">
              <div><b>{data?.hydrology.avg_temp ?? '–'}°</b><span>вода</span></div>
              <div><b>{data?.hydrology.avg_salinity ?? '–'}‰</b><span>солёность</span></div>
              <div><b>{data?.hydrology.sea_level ?? '–'}</b><span>уровень, м</span></div>
            </div>
          </div>

          <div className="card">
            <h3>ИИ-анализатор аудио</h3>
            <input type="file" accept=".wav,.mp3" onChange={uploadAudio} disabled={busy} />
            {busy && <p className="muted">Анализ…</p>}
            {audio?.error && <p className="muted">{audio.error}</p>}
            {audio?.label && (
              <>
                <p><b>{audio.label}</b> · {audio.confidence}%</p>
                <div className="bars">
                  {audio.spectrum.map((v, i) => <i key={i} style={{ height: `${Math.max(4, v * 100)}%` }} />)}
                </div>
              </>
            )}
          </div>

          <div className="card" style={{ flex: 1 }}>
            <h3>Лента тревог</h3>
            {data?.incidents.length === 0 && <p className="muted">Тревог нет. Нажмите «Симуляция».</p>}
            {data?.incidents.map(i => (
              <div key={i.id} className={`alert ${i.priority === 'high' ? 'high' : ''} ${i.id === selId ? 'sel' : ''}`} onClick={() => select(i)}>
                {TYPES[i.type]}
                {i.risk_zone && <span className="tag">в зоне риска</span>}
                <small>{i.message}</small>
                <small>{i.time.slice(11)} · {i.status}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="map" ref={divRef} />

        <div className="panel right">
          {!sel && <p className="muted">Выберите тревогу в ленте или на карте.</p>}
          {sel && (
            <div className="card">
              <h3>Карточка инцидента №{sel.id}</h3>
              <p><b>{TYPES[sel.type]}</b></p>
              <p className="muted">{sel.message}</p>
              <p className="muted">
                Точность ИИ: {Math.round(sel.confidence * 100)}%<br />
                Приоритет: {sel.priority === 'high' ? 'ВЫСОКИЙ' : 'средний'}<br />
                {sel.risk_zone ? '⚠ Внутри охраняемой зоны риска' : 'Вне зон риска'}<br />
                Статус: {sel.status}
              </p>
              <div className="bars">
                {fakeSpectrum(sel).map((v, i) => <i key={i} style={{ height: `${Math.max(4, v * 100)}%` }} />)}
              </div>
              <div className="row">
                <button className="btn" onClick={() => play(sel.type)}>▶ Прослушать</button>
                <button className="btn ok" disabled={sel.status === 'Патруль направлен'} onClick={() => dispatch(sel.id)}>
                  {sel.status === 'Патруль направлен' ? 'Патруль в пути' : 'Направить патруль'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
import { useRef, useEffect, useState } from 'react'
import { useStore, type Point, type Wall, type Opening } from './store'
const GRID = 50

type Tool = 'wall' | 'door' | 'window' | 'select' | 'label'

type Drag = {
    mode: 'wall' | 'end' | 'opening'
  start: Point
  orig: Wall[]
  index: number
  moved: boolean
  pt?: Point
}

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const view = useRef({ x: 0, y: 0, scale: 1 })
  const panning = useRef(false)

  const startPoint = useRef<Point | null>(null)
  const mouseWorld = useRef<Point | null>(null)
  const tool = useRef<Tool>('wall')
  const selected = useRef<number | null>(null)
  const selectedLabel = useRef<number | null>(null)
    const selectedOpening = useRef<number | null>(null)
  const drag = useRef<Drag | null>(null)
  const skipGrid = useRef(false)
  const includeGridRef = useRef(true)
  const [activeTool, setActiveTool] = useState<Tool>('wall')
  const [includeGrid, setIncludeGrid] = useState(true)

    function clearSelection() {
    selected.current = null
    selectedLabel.current = null
    selectedOpening.current = null
  }

  function chooseTool(t: Tool) {
    tool.current = t
    setActiveTool(t)
    startPoint.current = null
    draw()
  }

   function deleteSelected() {
    if (selected.current !== null) {
      useStore.getState().deleteWall(selected.current)
    } else if (selectedLabel.current !== null) {
      useStore.getState().deleteLabel(selectedLabel.current)
    } else if (selectedOpening.current !== null) {
      useStore.getState().deleteOpening(selectedOpening.current)
    }
    clearSelection()
    draw()
  }

  function doUndo() {
    useStore.getState().undo()
    startPoint.current = null
    clearSelection()
    draw()
  }

  function doRedo() {
    useStore.getState().redo()
    startPoint.current = null
    clearSelection()
    draw()
  }

  function toWorld(e: React.MouseEvent): Point {
    const { x, y, scale } = view.current
    return { x: (e.clientX - x) / scale, y: (e.clientY - y) / scale }
  }

  function snap(p: Point): Point {
    return { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID }
  }

  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y, scale } = view.current

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(scale, 0, 0, scale, x, y)

    // grid
    if (!skipGrid.current) {
      ctx.strokeStyle = '#ddd'
      ctx.lineWidth = 1 / scale
      const left = -x / scale
      const right = (canvas.width - x) / scale
      const top = -y / scale
      const bottom = (canvas.height - y) / scale

      for (let gx = Math.floor(left / GRID) * GRID; gx <= right; gx += GRID) {
        ctx.beginPath()
        ctx.moveTo(gx, top)
        ctx.lineTo(gx, bottom)
        ctx.stroke()
      }
      for (let gy = Math.floor(top / GRID) * GRID; gy <= bottom; gy += GRID) {
        ctx.beginPath()
        ctx.moveTo(left, gy)
        ctx.lineTo(right, gy)
        ctx.stroke()
      }
    }

    const st = useStore.getState()

    // walls
    ctx.lineCap = 'round'
    st.walls.forEach((w, i) => {
      ctx.strokeStyle = i === selected.current ? '#f97316' : '#222'
      ctx.lineWidth = 6 / scale
      ctx.beginPath()
      ctx.moveTo(w.start.x, w.start.y)
      ctx.lineTo(w.end.x, w.end.y)
      ctx.stroke()
    })

    // doors and windows
       for (const [oi, o] of st.openings.entries()) {
      const w = st.walls[o.wallIndex]
      if (!w) continue
      const dx = w.end.x - w.start.x
      const dy = w.end.y - w.start.y
      const len = Math.hypot(dx, dy)
      if (len === 0) continue
      const ux = dx / len
      const uy = dy / len

      const width = Math.min(o.width, len * 0.8)
      const half = width / 2
      const dist = Math.max(half, Math.min(len - half, o.t * len))
      const cx = w.start.x + ux * dist
      const cy = w.start.y + uy * dist
      const ax = cx - ux * half
      const ay = cy - uy * half
      const bx = cx + ux * half
      const by = cy + uy * half

      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = '#000'
      ctx.lineCap = 'butt'
      ctx.lineWidth = 10 / scale
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
      ctx.restore()

            ctx.strokeStyle = oi === selectedOpening.current ? '#f97316' : '#3b82f6'
      ctx.lineWidth = (oi === selectedOpening.current ? 3 : 2) / scale
      ctx.lineCap = 'butt'
      if (o.kind === 'window') {
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()
      } else {
        const a0 = Math.atan2(uy, ux)
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(ax - uy * width, ay + ux * width)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(ax, ay, width, a0, a0 + Math.PI / 2)
        ctx.stroke()
      }
    }
    ctx.lineCap = 'round'

    // dimension labels (rotated along each wall)
    for (const w of st.walls) {
      const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y)
      const meters = (len / 100).toFixed(2)
      const mx = (w.start.x + w.end.x) / 2
      const my = (w.start.y + w.end.y) / 2
      const angle = Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x)
      const a = angle > Math.PI / 2 || angle < -Math.PI / 2 ? angle + Math.PI : angle

      ctx.save()
      ctx.translate(mx, my)
      ctx.rotate(a)
      ctx.fillStyle = '#111'
      ctx.font = `${14 / scale}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(`${meters} m`, 0, -10 / scale)
      ctx.restore()
    }

    // room labels
    st.labels.forEach((l, i) => {
      ctx.fillStyle = i === selectedLabel.current ? '#f97316' : '#1e3a8a'
      ctx.font = `bold ${18 / scale}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(l.text, l.x, l.y)
    })
    ctx.textBaseline = 'alphabetic'

    // end handles on the selected wall
    if (selected.current !== null && st.walls[selected.current]) {
      const sw = st.walls[selected.current]
      for (const pt of [sw.start, sw.end]) {
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = '#f97316'
        ctx.lineWidth = 2 / scale
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 7 / scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }

    // preview line + label
    const sp = startPoint.current
    const mp = mouseWorld.current
    if (sp && mp && tool.current === 'wall') {
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 4 / scale
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(sp.x, sp.y)
      ctx.lineTo(mp.x, mp.y)
      ctx.stroke()

      const plen = Math.hypot(mp.x - sp.x, mp.y - sp.y)
      ctx.fillStyle = '#3b82f6'
      ctx.font = `${14 / scale}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(
        `${(plen / 100).toFixed(2)} m`,
        (sp.x + mp.x) / 2,
        (sp.y + mp.y) / 2 - 10 / scale
      )
    }

    // snap cursor
    if (mp) {
      ctx.fillStyle = '#3b82f6'
      ctx.beginPath()
      ctx.arc(mp.x, mp.y, 5 / scale, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      draw()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        startPoint.current = null
        clearSelection()
        draw()
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'z') doUndo()
      if (e.ctrlKey && e.key.toLowerCase() === 'y') doRedo()
      if (e.ctrlKey) return
      if (e.key === 'w') chooseTool('wall')
      if (e.key === 'd') chooseTool('door')
      if (e.key === 'n') chooseTool('window')
      if (e.key === 's') chooseTool('select')
      if (e.key === 'l') chooseTool('label')
      if (e.key === 'Delete') deleteSelected()
      if (e.key === '0') {
        view.current = { x: 0, y: 0, scale: 1 }
        draw()
      }
    }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  function onWheel(e: React.WheelEvent) {
    const v = view.current
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const newScale = Math.min(5, Math.max(0.2, v.scale * factor))
    const k = newScale / v.scale
    v.x = e.clientX - (e.clientX - v.x) * k
    v.y = e.clientY - (e.clientY - v.y) * k
    v.scale = newScale
    draw()
  }
  function openingCenter(o: Opening, walls: Wall[]) {
    const w = walls[o.wallIndex]
    if (!w) return null
    const dx = w.end.x - w.start.x
    const dy = w.end.y - w.start.y
    const len = Math.hypot(dx, dy)
    if (len === 0) return null
    const half = Math.min(o.width, len * 0.8) / 2
    const dist = Math.max(half, Math.min(len - half, o.t * len))
    return { x: w.start.x + (dx / len) * dist, y: w.start.y + (dy / len) * dist, half }
  }
  function nearestWall(p: Point) {
    const walls = useStore.getState().walls
    let best = { index: -1, t: 0, dist: Infinity }
    walls.forEach((w, i) => {
      const dx = w.end.x - w.start.x
      const dy = w.end.y - w.start.y
      const t = Math.max(
        0,
        Math.min(1, ((p.x - w.start.x) * dx + (p.y - w.start.y) * dy) / (dx * dx + dy * dy))
      )
      const d = Math.hypot(p.x - (w.start.x + t * dx), p.y - (w.start.y + t * dy))
      if (d < best.dist) best = { index: i, t, dist: d }
    })
    return best
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button === 2) {
      panning.current = true
      return
    }
    if (e.button === 0) {
      // select tool: click selects, dragging an end or the wall moves it
      if (tool.current === 'select') {
        const p = toWorld(e)
        const st = useStore.getState()
        const walls = st.walls
        const reach = 14 / view.current.scale

        // 0) did we click a room label?
        let li = -1
        st.labels.forEach((l, i) => {
          const hw = (l.text.length * 5.5 + 8) / view.current.scale
          const hh = 14 / view.current.scale
          if (Math.abs(p.x - l.x) < hw && Math.abs(p.y - l.y) < hh) li = i
        })
                if (li >= 0) {
          selectedLabel.current = li
          selected.current = null
          selectedOpening.current = null
          draw()
          return
        }
        selectedLabel.current = null
        selectedOpening.current = null

        // 1) did we click a wall end?
        let endIndex = -1
        let endPt: Point | null = null
        let bestD = Infinity
        for (let i = 0; i < walls.length; i++) {
          const ends = [walls[i].start, walls[i].end]
          for (let k = 0; k < ends.length; k++) {
            const d = Math.hypot(p.x - ends[k].x, p.y - ends[k].y)
            if (d < reach && d < bestD) {
              bestD = d
              endIndex = i
              endPt = ends[k]
            }
          }
        }
        if (endIndex >= 0 && endPt) {
          selected.current = endIndex
          drag.current = {
            mode: 'end',
            start: snap(p),
            orig: walls,
            index: endIndex,
            moved: false,
            pt: endPt,
          }
          draw()
          return
        }
        // 1b) did we click a door or window?
        let oi = -1
        let oiDist = Infinity
        st.openings.forEach((o, i) => {
          const c = openingCenter(o, walls)
          if (!c) return
          const d = Math.hypot(p.x - c.x, p.y - c.y)
          if (d < Math.max(c.half, 12 / view.current.scale) && d < oiDist) {
            oiDist = d
            oi = i
          }
        })
        if (oi >= 0) {
          selectedOpening.current = oi
          selected.current = null
          drag.current = { mode: 'opening', start: p, orig: walls, index: oi, moved: false }
          draw()
          return
        }
        // 2) otherwise, did we click a wall body?
        const best = nearestWall(p)
        if (best.index >= 0 && best.dist < 20 / view.current.scale) {
          selected.current = best.index
          drag.current = {
            mode: 'wall',
            start: snap(p),
            orig: walls,
            index: best.index,
            moved: false,
          }
        } else {
          selected.current = null
        }
        draw()
        return
      }

      // label tool
      if (tool.current === 'label') {
        const p = toWorld(e)
        const text = prompt('Room name:')
        if (text && text.trim()) {
          useStore.getState().addLabel({ x: p.x, y: p.y, text: text.trim() })
        }
        draw()
        return
      }

      // door / window tool
      if (tool.current === 'door' || tool.current === 'window') {
        const best = nearestWall(toWorld(e))
        if (best.index >= 0 && best.dist < 20 / view.current.scale) {
          useStore.getState().addOpening({
            wallIndex: best.index,
            t: best.t,
            kind: tool.current,
            width: 90,
          })
          draw()
        }
        return
      }

      // wall tool
      const p = snap(toWorld(e))
      const sp = startPoint.current
      if (sp && (sp.x !== p.x || sp.y !== p.y)) {
        useStore.getState().addWall({ start: sp, end: p })
      }
      startPoint.current = p
      draw()
    }
  }

  function moveDragged(e: React.MouseEvent) {
    const d = drag.current
    if (!d) return
        if (d.mode === 'opening') {
      const best = nearestWall(toWorld(e))
      if (best.index < 0 || best.dist > 40 / view.current.scale) return
      const st = useStore.getState()
      const o = st.openings[d.index]
      if (!o || (o.wallIndex === best.index && Math.abs(o.t - best.t) < 0.001)) return
      if (!d.moved) {
        st.commitHistory()
        d.moved = true
      }
      st.setOpenings(
        st.openings.map((op, i) =>
          i === d.index ? { ...op, wallIndex: best.index, t: best.t } : op
        )
      )
      return
    }
    const p = snap(toWorld(e))
    const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y

    let newWalls: Wall[]

    if (d.mode === 'end' && d.pt) {
      const from = d.pt
      if (same(p, from) && !d.moved) return
      newWalls = d.orig.map((w) => ({
        start: same(w.start, from) ? p : w.start,
        end: same(w.end, from) ? p : w.end,
      }))
      if (newWalls.some((w) => same(w.start, w.end))) return
    } else {
      const dx = p.x - d.start.x
      const dy = p.y - d.start.y
      if (dx === 0 && dy === 0 && !d.moved) return
      const base = d.orig[d.index]
      const mv = (pt: Point): Point => ({ x: pt.x + dx, y: pt.y + dy })
      const follows = (pt: Point) => same(pt, base.start) || same(pt, base.end)
      newWalls = d.orig.map((w, i) => {
        if (i === d.index) return { start: mv(w.start), end: mv(w.end) }
        return {
          start: follows(w.start) ? mv(w.start) : w.start,
          end: follows(w.end) ? mv(w.end) : w.end,
        }
      })
    }

    if (!d.moved) {
      useStore.getState().commitHistory()
      d.moved = true
    }
    useStore.getState().setWalls(newWalls)
  }

  function onMouseMove(e: React.MouseEvent) {
    if (panning.current) {
      view.current.x += e.movementX
      view.current.y += e.movementY
    } else if (drag.current) {
      moveDragged(e)
    } else {
      mouseWorld.current = snap(toWorld(e))
    }
    draw()
  }

  function stopMouse() {
    panning.current = false
    drag.current = null
  }

  function exportPng() {
    const st = useStore.getState()
    if (st.walls.length === 0) {
      alert('Nothing to export yet')
      return
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const w of st.walls) {
      for (const p of [w.start, w.end]) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
    }
    const margin = 80
    minX -= margin; minY -= margin; maxX += margin; maxY += margin

    const canvas = canvasRef.current!
    const saved = { ...view.current }
    const savedW = canvas.width
    const savedH = canvas.height
    const savedSel = selected.current
    const savedLabel = selectedLabel.current
    const savedMouse = mouseWorld.current

    const outW = 1600
    const scale = outW / (maxX - minX)
    const outH = Math.round((maxY - minY) * scale)

    canvas.width = outW
    canvas.height = outH
    view.current = { x: -minX * scale, y: -minY * scale, scale }
    selected.current = null
    selectedLabel.current = null
    mouseWorld.current = null
    skipGrid.current = !includeGridRef.current
    draw()

    const out = document.createElement('canvas')
    out.width = outW
    out.height = outH
    const octx = out.getContext('2d')!
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, outW, outH)
    octx.drawImage(canvas, 0, 0)

    const a = document.createElement('a')
    a.href = out.toDataURL('image/png')
    a.download = 'floorplan.png'
    a.click()

    skipGrid.current = false
    canvas.width = savedW
    canvas.height = savedH
    view.current = saved
    selected.current = savedSel
    selectedLabel.current = savedLabel
    mouseWorld.current = savedMouse
    draw()
  }

  function loadDemo() {
    if (!confirm('Load the demo apartment? Ctrl+Z brings your drawing back.')) return
    const W = (a: number, b: number, c: number, d: number): Wall => ({
      start: { x: a, y: b },
      end: { x: c, y: d },
    })
    const O = (wallIndex: number, t: number, kind: 'door' | 'window') => ({
      wallIndex,
      t,
      kind,
      width: 90,
    })
    const walls = [
      W(100, 150, 900, 150), // 0 top
      W(900, 150, 900, 650), // 1 right
      W(900, 650, 100, 650), // 2 bottom
      W(100, 650, 100, 150), // 3 left
      W(500, 150, 500, 400), // 4 bedroom / living
      W(100, 400, 500, 400), // 5 bedroom / kitchen
      W(500, 400, 900, 400), // 6 living / kitchen + bathroom
      W(700, 400 + 0, 700, 650), // 7 kitchen / bathroom
    ]
    const openings = [
      O(2, 0.45, 'door'), // entrance
      O(5, 0.5, 'door'), // bedroom door
      O(6, 0.15, 'door'), // living room door
      O(7, 0.4, 'door'), // bathroom door
      O(0, 0.25, 'window'),
      O(0, 0.75, 'window'),
      O(3, 0.7, 'window'),
      O(1, 0.2, 'window'),
      O(1, 0.8, 'window'),
    ]
    const labels = [
      { x: 300, y: 275, text: 'Bedroom' },
      { x: 700, y: 275, text: 'Living room' },
      { x: 400, y: 525, text: 'Kitchen' },
      { x: 800, y: 525, text: 'Bathroom' },
    ]
    useStore.getState().load(walls, openings, labels)
    view.current = { x: 0, y: 0, scale: 1 }
    clearSelection()
    startPoint.current = null
    draw()
  }

  const btn: React.CSSProperties = {
    padding: '6px 12px',
    border: '1px solid #999',
    borderRadius: 6,
    background: '#fff',
    color: '#111',
    cursor: 'pointer',
    fontSize: 14,
  }

  const toolBtn = (t: Tool): React.CSSProperties => ({
    ...btn,
    background: activeTool === t ? '#3b82f6' : '#fff',
    color: activeTool === t ? '#fff' : '#111',
    borderColor: activeTool === t ? '#3b82f6' : '#999',
  })

  function saveFile() {
    const { walls, openings, labels } = useStore.getState()
    const name = prompt('File name:', 'floorplan') || 'floorplan'
    const blob = new Blob([JSON.stringify({ walls, openings, labels }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name + '.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function newDrawing() {
    if (!confirm('Start a new drawing? Save the current one first. Ctrl+Z can bring it back.')) return
    useStore.getState().reset()
    clearSelection()
    startPoint.current = null
    draw()
  }

  function openFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        useStore.getState().load(data.walls ?? [], data.openings ?? [], data.labels ?? [])
        clearSelection()
        startPoint.current = null
        draw()
      } catch {
        alert('Could not read that file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 10,
          left: 10,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <button style={btn} onClick={newDrawing}>New</button>
        <button style={btn} onClick={saveFile}>Save file</button>
        <label style={btn}>
          Open
          <input type="file" accept=".json" onChange={openFile} style={{ display: 'none' }} />
        </label>
        <button style={btn} onClick={exportPng}>Export PNG</button>
        <label
          style={{
            fontSize: 13,
            color: '#111',
            background: 'rgba(255,255,255,0.85)',
            padding: '4px 8px',
            borderRadius: 6,
          }}
        >
          <input
            type="checkbox"
            checked={includeGrid}
            onChange={(e) => {
              setIncludeGrid(e.target.checked)
              includeGridRef.current = e.target.checked
            }}
          />{' '}
          Grid in PNG
        </label>
        <button style={btn} onClick={loadDemo}>Demo</button>
      </div>
      <div style={{ position: 'fixed', top: 52, left: 10, display: 'flex', gap: 8 }}>
        <button style={toolBtn('wall')} onClick={() => chooseTool('wall')}>Wall</button>
        <button style={toolBtn('door')} onClick={() => chooseTool('door')}>Door</button>
        <button style={toolBtn('window')} onClick={() => chooseTool('window')}>Window</button>
        <button style={toolBtn('select')} onClick={() => chooseTool('select')}>Select</button>
        <button style={toolBtn('label')} onClick={() => chooseTool('label')}>Label</button>
        <button style={btn} onClick={doUndo}>Undo</button>
        <button style={btn} onClick={doRedo}>Redo</button>
        <button style={btn} onClick={deleteSelected}>Delete</button>
      </div>
      <div
        style={{
          position: 'fixed',
          bottom: 10,
          left: 10,
          fontSize: 13,
          color: '#444',
          background: 'rgba(255,255,255,0.85)',
          padding: '4px 8px',
          borderRadius: 6,
        }}
      >
        Select: click a wall or label, drag to move, drag an end circle to resize, Delete removes it. Right-click + drag to pan, scroll to zoom.
      </div>
      <canvas
        ref={canvasRef}
        style={{ display: 'block' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseUp={stopMouse}
        onMouseLeave={stopMouse}
        onMouseMove={onMouseMove}
        onContextMenu={(e) => e.preventDefault()}
      />
    </>
  )
}
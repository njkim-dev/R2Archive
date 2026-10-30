import { useEffect, useRef, useState } from 'react'

const modelCache = new Map()
async function model(url) {
  if (!modelCache.has(url)) modelCache.set(url, fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error('3D 모델을 불러오지 못했습니다.')
    return response.json()
  }).catch(error => { modelCache.delete(url); throw error }))
  return modelCache.get(url)
}

export default function ShopViewer({ meta, sex, slots, counterparts, pair, angle, zoom }) {
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const [status, setStatus] = useState('3D 모델을 준비 중입니다.')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    const resources = []
    const canvas = canvasRef.current
    setStatus('3D 모델을 준비 중입니다.')
    setFailed(false)
    rendererRef.current = null
    async function load() {
      const gl = canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true })
      if (!gl) throw new Error('이 브라우저는 3D 미리보기를 지원하지 않습니다.')
      const sources = [meta.bases[sex], ...Object.values(slots).filter(Boolean).map(item => item.model)]
      if (pair) sources.push(meta.bases[sex === 'male' ? 'female' : 'male'], ...Object.values(counterparts).filter(Boolean).map(item => item.model))
      const models = Object.fromEntries(await Promise.all([...new Set(sources)].map(async url => [url, await model(url)])))
      if (cancelled) return
      function shader(type, source) {
        const item = gl.createShader(type)
        gl.shaderSource(item, source); gl.compileShader(item)
        if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error('3D 화면 초기화에 실패했습니다.')
        resources.push(() => gl.deleteShader(item))
        return item
      }
      const program = gl.createProgram()
      resources.push(() => gl.deleteProgram(program))
      gl.attachShader(program, shader(gl.VERTEX_SHADER, `attribute vec3 position;attribute vec3 normal;attribute vec2 uv;uniform float angle;uniform float aspect;uniform float halfHeight;uniform float offsetX;varying vec2 texcoord;varying float lighting;void main(){float c=cos(angle),s=sin(angle);vec3 p=position-vec3(0.,148.,0.);vec3 q=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);q.x+=offsetX;vec3 n=vec3(c*normal.x+s*normal.z,normal.y,-s*normal.x+c*normal.z);gl_Position=vec4(q.x/(halfHeight*aspect),q.y/halfHeight,-q.z/500.,1.);texcoord=uv;lighting=.76+.24*max(dot(normalize(n),normalize(vec3(-.35,.65,1.))),0.);}`))
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `precision mediump float;uniform sampler2D map;varying vec2 texcoord;varying float lighting;void main(){vec4 t=texture2D(map,texcoord);if(t.a<.43)discard;gl_FragColor=vec4(t.rgb*lighting,1.);}`))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('3D 화면 초기화에 실패했습니다.')
      gl.useProgram(program); gl.enable(gl.DEPTH_TEST)
      const attrs = Object.fromEntries(['position', 'normal', 'uv'].map(key => [key, gl.getAttribLocation(program, key)]))
      const uniforms = Object.fromEntries(['angle', 'aspect', 'halfHeight', 'offsetX'].map(key => [key, gl.getUniformLocation(program, key)]))
      const textures = {}
      const textureNames = [...new Set(Object.values(models).flatMap(m => m.meshes.map(mesh => mesh.texture)))]
      await Promise.all(textureNames.map(async name => {
        if (!/^[a-f0-9]{64}\.webp$/.test(name)) throw new Error('텍스처 자료가 올바르지 않습니다.')
        const response = await fetch(`/api/shop/assets/${meta.revision}/textures/${name}`, { credentials: 'same-origin', cache: 'no-store' })
        if (!response.ok) throw new Error('3D 텍스처를 불러오지 못했습니다.')
        const bitmap = await createImageBitmap(await response.blob())
        if (cancelled) { bitmap.close(); return }
        const texture = gl.createTexture(); resources.push(() => gl.deleteTexture(texture))
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap); bitmap.close()
        for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        textures[name] = texture
      }))
      if (cancelled) return
      const gpu = Object.fromEntries(Object.entries(models).map(([url, payload]) => [url, payload.meshes.map(mesh => {
        const vb = gl.createBuffer(), ib = gl.createBuffer()
        resources.push(() => { gl.deleteBuffer(vb); gl.deleteBuffer(ib) })
        gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.vertices), gl.STATIC_DRAW)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices), gl.STATIC_DRAW)
        return { name: mesh.name, vb, ib, count: mesh.indices.length, texture: textures[mesh.texture] }
      })]))
      function figure(gender, chosen) {
        const result = new Map(gpu[meta.bases[gender]].map(mesh => [mesh.name, mesh]))
        Object.entries(chosen).filter(([slot, item]) => slot !== 'pet' && item).forEach(([, item]) => gpu[item.model].forEach(mesh => result.set(mesh.name, mesh)))
        return [...result.values()]
      }
      function paint(meshes, offset) {
        gl.uniform1f(uniforms.offsetX, offset)
        for (const mesh of meshes) {
          gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb)
          for (const [key, size, byte] of [['position', 3, 0], ['normal', 3, 12], ['uv', 2, 24]]) { gl.enableVertexAttribArray(attrs[key]); gl.vertexAttribPointer(attrs[key], size, gl.FLOAT, false, 32, byte) }
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.bindTexture(gl.TEXTURE_2D, mesh.texture)
          gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0)
        }
      }
      rendererRef.current = (rotation, scale) => {
        const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2)
        if (!rect.width || !rect.height) return
        canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr)
        const aspect = rect.width / rect.height
        gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        gl.uniform1f(uniforms.angle, rotation * Math.PI / 180); gl.uniform1f(uniforms.aspect, aspect)
        gl.uniform1f(uniforms.halfHeight, Math.max(175, (pair ? 145 : 105) / aspect) * 100 / scale)
        paint(figure(sex, slots), pair ? -65 : 0)
        if (pair) paint(figure(sex === 'male' ? 'female' : 'male', counterparts), 65)
        if (slots.pet) paint(gpu[slots.pet.model], pair ? 92 : 0)
      }
      setStatus('')
    }
    load().catch(error => { if (!cancelled) { setStatus(error.message); setFailed(true) } })
    return () => { cancelled = true; rendererRef.current = null; resources.forEach(dispose => dispose()) }
  }, [meta, sex, slots, counterparts, pair])
  useEffect(() => {
    const draw = () => rendererRef.current?.(angle, zoom)
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvasRef.current)
    return () => observer.disconnect()
  }, [angle, zoom, status])
  return <div className="shop-stage">
    <canvas ref={canvasRef} role="img" aria-label={pair ? '남녀 캐릭터의 전신 착장 미리보기' : '선택한 아이템을 착용한 전신 캐릭터'} />
    <div className="shop-stage-status" role={failed ? 'alert' : 'status'}>{status}</div>
    <div className="shop-character-labels"><span>{sex === 'male' ? '남성' : '여성'} · 선택한 착장</span>{pair && <span>{sex === 'male' ? '여성' : '남성'} · 대응 착장</span>}</div>
  </div>
}

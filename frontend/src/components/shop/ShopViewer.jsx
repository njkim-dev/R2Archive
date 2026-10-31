import { useEffect, useRef, useState } from 'react'
import { multiplyPose, extraLocal } from '../../utils/shopMotion'

const modelCache = new Map()
const motionCache = new Map()
async function motionData(url) {
  if (!motionCache.has(url)) {
    if (motionCache.size >= 4) motionCache.delete(motionCache.keys().next().value)
    motionCache.set(url, fetch(url, { credentials: 'same-origin', cache: 'force-cache' }).then(response => {
      if (!response.ok) throw new Error('커플 모션을 불러오지 못했습니다.')
      return response.json()
    }).catch(error => { motionCache.delete(url); throw error }))
  }
  return motionCache.get(url)
}
const identityPose = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function posedBounds(bounds, pose) {
  const result = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]]
  for (const x of [bounds[0][0], bounds[1][0]]) for (const y of [bounds[0][1], bounds[1][1]]) for (const z of [bounds[0][2], bounds[1][2]]) {
    for (let axis = 0; axis < 3; axis++) {
      const value = x * pose[axis] + y * pose[4 + axis] + z * pose[8 + axis] + pose[12 + axis]
      result[0][axis] = Math.min(result[0][axis], value); result[1][axis] = Math.max(result[1][axis], value)
    }
  }
  return result
}
async function model(url) {
  if (!modelCache.has(url)) modelCache.set(url, fetch(url, { credentials: 'same-origin', cache: 'force-cache' }).then(async response => {
    if (!response.ok) throw new Error('3D 모델을 불러오지 못했습니다.')
    return response.json()
  }).catch(error => { modelCache.delete(url); throw error }))
  return modelCache.get(url)
}

export default function ShopViewer({ meta, sex, slots, counterparts, pair, angle, zoom, motion = null, audioContext = null, audioReady = null }) {
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const [status, setStatus] = useState('3D 모델을 준비 중입니다.')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    const resources = []
    const abort = new AbortController()
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
      let clip, binding, buffer, startedAt = Infinity
      if (motion) {
        const [data, bindings, response] = await Promise.all([motionData(motion.motion), motionData(motion.bindings), fetch(motion.audio, { credentials: 'same-origin', cache: 'force-cache', signal: abort.signal })])
        if (!response.ok || data.schema !== 'shop-couple-motion-v1' || bindings.schema !== data.schema || !Number.isInteger(data.frame_count) || data.frame_count < 2 || data.frame_count > 5400) throw new Error('커플 미리보기 자료가 올바르지 않습니다.')
        clip = { ...data, actors: {} }; binding = bindings.bindings || {}
        for (const gender of ['male', 'female']) {
          if (data.bases && data.bases[gender] !== meta.bases[gender].split('/').at(-1)) throw new Error('캐릭터 자세 자료를 갱신 중입니다. 잠시 후 다시 열어주세요.')
          const actor = data.actors?.[gender]
          if (!Array.isArray(actor?.bones) || !actor.bones.length || actor.bones.length > 100 || actor.frames?.length !== data.frame_count * actor.bones.length * 16 || !actor.frames.every(Number.isFinite)) throw new Error('커플 동작 자료가 올바르지 않습니다.')
          const extras = {}
          for (const [name, track] of Object.entries(actor.extras || {})) {
            if (track.frames?.length !== data.frame_count * 16 || !track.frames.every(Number.isFinite)) throw new Error('의상 동작 자료가 올바르지 않습니다.')
            extras[name] = { ...track, frames: new Float32Array(track.frames) }
          }
          clip.actors[gender] = { bones: actor.bones, frames: new Float32Array(actor.frames), extras }
        }
        if (!audioContext) throw new Error('이 브라우저에서 소리를 재생할 수 없습니다.')
        if (!await audioReady) throw new Error('소리를 시작하지 못했습니다. 창을 닫고 다시 열어주세요.')
        buffer = await audioContext.decodeAudioData(await response.arrayBuffer())
        if (audioContext.state !== 'running') throw new Error('소리를 시작하지 못했습니다. 창을 닫고 다시 열어주세요.')
      }
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
      // MD9의 좌우 방향을 화면 좌표에 맞춘다. 아래 bounds 계산에도 같은 변환이 필요하다.
      gl.attachShader(program, shader(gl.VERTEX_SHADER, `
        attribute vec3 position;
        attribute vec3 normal;
        attribute vec2 uv;
        uniform float angle,aspect,halfHeight,halfDepth,centerX,centerY,centerZ,offsetX;
        uniform mat4 attachmentPose;
        varying vec2 texcoord;
        varying float lighting;
        void main(){
          float c=cos(angle),s=sin(angle);
          vec3 p=(attachmentPose*vec4(position,1.)).xyz-vec3(0.,148.,0.);
          vec3 posedNormal=mat3(attachmentPose)*normal;
          vec3 q=vec3(-c*p.x-s*p.z+offsetX,p.y,-s*p.x+c*p.z);
          vec3 n=vec3(-c*posedNormal.x-s*posedNormal.z,posedNormal.y,-s*posedNormal.x+c*posedNormal.z);
          gl_Position=vec4((q.x-centerX)/(halfHeight*aspect),(q.y-centerY)/halfHeight,-(q.z-centerZ)/halfDepth,1.);
          texcoord=uv;
          lighting=.76+.24*max(dot(normalize(n),normalize(vec3(-.35,.65,1.))),0.);
        }
      `))
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `precision mediump float;uniform sampler2D map;varying vec2 texcoord;varying float lighting;void main(){vec4 t=texture2D(map,texcoord);if(t.a<.43)discard;gl_FragColor=vec4(t.rgb*lighting,1.);}`))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('3D 화면 초기화에 실패했습니다.')
      gl.useProgram(program); gl.enable(gl.DEPTH_TEST)
      const attrs = Object.fromEntries(['position', 'normal', 'uv'].map(key => [key, gl.getAttribLocation(program, key)]))
      const uniforms = Object.fromEntries(['angle', 'aspect', 'halfHeight', 'halfDepth', 'centerX', 'centerY', 'centerZ', 'offsetX', 'attachmentPose'].map(key => [key, gl.getUniformLocation(program, key)]))
      const textures = {}
      const textureNames = [...new Set(Object.values(models).flatMap(m => m.meshes.map(mesh => mesh.texture)))]
      await Promise.all(textureNames.map(async name => {
        if (!/^[a-f0-9]{64}\.webp$/.test(name)) throw new Error('텍스처 자료가 올바르지 않습니다.')
        const response = await fetch(`/api/shop/assets/${meta.texture_revision || meta.revision}/textures/${name}`, { credentials: 'same-origin', cache: 'force-cache' })
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
        const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]]
        for (let i = 0; i < mesh.vertices.length; i += 8) for (let axis = 0; axis < 3; axis++) {
          bounds[0][axis] = Math.min(bounds[0][axis], mesh.vertices[i + axis])
          bounds[1][axis] = Math.max(bounds[1][axis], mesh.vertices[i + axis])
        }
        return { name: mesh.name, modelKey: url.split('/').at(-1), vb, ib, count: mesh.indices.length, texture: textures[mesh.texture], bounds }
      })]))
      function figure(gender, chosen, frame = 0) {
        const result = new Map(gpu[meta.bases[gender]].map(mesh => [mesh.name, mesh]))
        Object.entries(chosen).filter(([slot, item]) => slot !== 'pet' && item).forEach(([, item]) => gpu[item.model].forEach(mesh => result.set(mesh.name, mesh)))
        const pose = models[meta.bases[gender]].attachment_pose
        if (pose && (pose.length !== 16 || !pose.every(Number.isFinite))) throw new Error('캐릭터 자세 자료가 올바르지 않습니다.')
        return [...result.values()].map(mesh => {
          const anchor = pose && mesh.name.startsWith('Summon-') ? pose : null
          if (!clip) return anchor ? { ...mesh, pose: anchor, bounds: posedBounds(mesh.bounds, anchor) } : mesh
          const actor = clip.actors[gender]
          const target = binding[mesh.modelKey]?.[mesh.name]
          const name = mesh.name.startsWith('Summon-') ? 'Waist' : (typeof target === 'object' ? target.bone : target) || mesh.name
          const index = Math.max(0, actor.bones.indexOf(name) < 0 ? actor.bones.indexOf('Waist') : actor.bones.indexOf(name))
          const offset = (frame * actor.bones.length + index) * 16
          let delta = actor.frames.subarray(offset, offset + 16)
          if (target?.chain?.some(node => actor.extras[node.name])) {
            let chain = identityPose
            for (const node of target.chain) chain = multiplyPose(extraLocal(node.bind, actor.extras[node.name], frame), chain)
            delta = multiplyPose(target.inverse, multiplyPose(chain, multiplyPose(target.parent, delta)))
          }
          const animated = anchor ? multiplyPose(anchor, delta) : delta
          return { ...mesh, pose: animated, bounds: posedBounds(mesh.bounds, animated) }
        })
      }
      function paint(meshes, offset) {
        gl.uniform1f(uniforms.offsetX, offset)
        for (const mesh of meshes) {
          gl.uniformMatrix4fv(uniforms.attachmentPose, false, mesh.pose || identityPose)
          gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb)
          for (const [key, size, byte] of [['position', 3, 0], ['normal', 3, 12], ['uv', 2, 24]]) { gl.enableVertexAttribArray(attrs[key]); gl.vertexAttribPointer(attrs[key], size, gl.FLOAT, false, 32, byte) }
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.bindTexture(gl.TEXTURE_2D, mesh.texture)
          gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0)
        }
      }
      let envelope, envelopeAngle, previousFrame = -1, previousRotation, previousScale
      rendererRef.current = (rotation, scale) => {
        const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2)
        if (!rect.width || !rect.height) return
        const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr)
        const resized = canvas.width !== width || canvas.height !== height
        if (canvas.width !== width) canvas.width = width
        if (canvas.height !== height) canvas.height = height
        const aspect = rect.width / rect.height
        const radians = rotation * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians)
        function horizontalBounds(meshes) {
          let left = Infinity, right = -Infinity
          for (const mesh of meshes) for (const x of [mesh.bounds[0][0], mesh.bounds[1][0]]) for (const z of [mesh.bounds[0][2], mesh.bounds[1][2]]) {
            const projected = -c * x - s * z
            left = Math.min(left, projected); right = Math.max(right, projected)
          }
          return [left, right]
        }
        const frame = clip ? Math.min(clip.frame_count - 1, Math.floor(Math.max(0, audioContext.currentTime - startedAt) % buffer.duration / buffer.duration * clip.frame_count)) : 0
        if (clip && frame === previousFrame && rotation === previousRotation && scale === previousScale && !resized) return
        previousFrame = frame; previousRotation = rotation; previousScale = scale
        if (clip) canvas.dataset.motionFrame = String(frame)
        const primary = figure(sex, slots, frame), secondary = pair ? figure(sex === 'male' ? 'female' : 'male', counterparts, frame) : null
        const hasAttachments = !!(slots.accessory || slots.summon || pair && (counterparts.accessory || counterparts.summon))
        const spacing = pair && hasAttachments && !clip ? Math.max(65, (horizontalBounds(primary)[1] - horizontalBounds(secondary)[0] + 20) / 2) : 65
        const scene = [{ meshes: primary, offset: pair ? -spacing : 0 }]
        if (pair) scene.push({ meshes: secondary, offset: spacing })
        if (clip && (!envelope || envelopeAngle !== rotation)) {
          envelopeAngle = rotation
          envelope = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]]
          for (let sample = 0; sample < clip.frame_count; sample++) for (const [gender, chosen, offset] of [[sex, slots, -spacing], [sex === 'male' ? 'female' : 'male', counterparts, spacing]]) for (const mesh of figure(gender, chosen, sample)) {
            for (const x of [mesh.bounds[0][0], mesh.bounds[1][0]]) for (const y of [mesh.bounds[0][1], mesh.bounds[1][1]]) for (const z of [mesh.bounds[0][2], mesh.bounds[1][2]]) {
              const point = [-c * x - s * z + offset, y - 148, -s * x + c * z]
              for (let axis = 0; axis < 3; axis++) { envelope[0][axis] = Math.min(envelope[0][axis], point[axis]); envelope[1][axis] = Math.max(envelope[1][axis], point[axis]) }
            }
          }
        }
        if (slots.pet) {
          const meshes = gpu[slots.pet.model]
          const centerX = (Math.min(...meshes.map(mesh => mesh.bounds[0][0])) + Math.max(...meshes.map(mesh => mesh.bounds[1][0]))) / 2
          const centerZ = (Math.min(...meshes.map(mesh => mesh.bounds[0][2])) + Math.max(...meshes.map(mesh => mesh.bounds[1][2]))) / 2
          // 펫 형상은 보정하되 기존 회전 각도별 배치 중심은 유지한다.
          let offset = (pair ? 92 : 0) + 2 * (c * centerX + s * centerZ)
          if (hasAttachments || clip) {
            const figureRight = envelope ? envelope[1][0] : Math.max(...scene.map(group => horizontalBounds(group.meshes)[1] + group.offset))
            offset += Math.max(0, figureRight + 15 - (horizontalBounds(meshes)[0] + offset))
          }
          scene.push({ meshes, offset })
        }
        const bounds = envelope ? envelope.map(values => [...values]) : [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]]
        for (const group of scene) for (const mesh of group.meshes) {
          for (const x of [mesh.bounds[0][0], mesh.bounds[1][0]]) for (const y of [mesh.bounds[0][1], mesh.bounds[1][1]]) for (const z of [mesh.bounds[0][2], mesh.bounds[1][2]]) {
            const point = [-c * x - s * z + group.offset, y - 148, -s * x + c * z]
            for (let axis = 0; axis < 3; axis++) { bounds[0][axis] = Math.min(bounds[0][axis], point[axis]); bounds[1][axis] = Math.max(bounds[1][axis], point[axis]) }
          }
        }
        gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        gl.uniform1f(uniforms.angle, radians); gl.uniform1f(uniforms.aspect, aspect)
        for (const [axis, key] of ['centerX', 'centerY', 'centerZ'].entries()) gl.uniform1f(uniforms[key], (bounds[0][axis] + bounds[1][axis]) / 2)
        const halfHeight = Math.max((bounds[1][1] - bounds[0][1]) / 2, (bounds[1][0] - bounds[0][0]) / (2 * aspect), 1) * 1.12 * 100 / scale
        gl.uniform1f(uniforms.halfHeight, halfHeight)
        gl.uniform1f(uniforms.halfDepth, Math.max(500, (bounds[1][2] - bounds[0][2]) / 2 + 10))
        for (const [index, group] of scene.slice(0, pair ? 2 : 1).entries()) {
          const position = 50 + (group.offset - (bounds[0][0] + bounds[1][0]) / 2) / (halfHeight * aspect) * 50
          canvas.parentElement.style.setProperty(index ? '--shop-secondary-label' : '--shop-primary-label', `${Math.min(88, Math.max(12, position))}%`)
        }
        for (const group of scene) paint(group.meshes, group.offset)
      }
      if (clip) {
        rendererRef.current(angle, zoom)
        const source = audioContext.createBufferSource(), gain = audioContext.createGain()
        source.buffer = buffer; source.loop = true; gain.gain.value = .7
        source.connect(gain); gain.connect(audioContext.destination)
        resources.push(() => { try { source.stop() } catch {} source.disconnect(); gain.disconnect() })
        startedAt = audioContext.currentTime + .05; source.start(startedAt)
      }
      setStatus('')
    }
    load().catch(error => { if (!cancelled) { setStatus(error.message); setFailed(true) } })
    return () => { cancelled = true; abort.abort(); rendererRef.current = null; resources.forEach(dispose => dispose()) }
  }, [meta, sex, slots, counterparts, pair, motion, audioContext, audioReady])
  useEffect(() => {
    const draw = () => rendererRef.current?.(angle, zoom)
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvasRef.current)
    let frame
    if (motion && !status) {
      const tick = () => { draw(); frame = requestAnimationFrame(tick) }
      frame = requestAnimationFrame(tick)
    }
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [angle, zoom, status, motion])
  return <div className="shop-stage">
    <canvas ref={canvasRef} role="img" aria-label={pair ? '남녀 캐릭터의 전신 의상 미리보기' : '선택한 아이템을 착용한 전신 캐릭터'} />
    <div className="shop-stage-status" role={failed ? 'alert' : 'status'}>{status}</div>
    <div className="shop-character-labels"><span>{sex === 'male' ? '남성' : '여성'} ㆍ 선택한 의상</span>{pair && <span>{sex === 'male' ? '여성' : '남성'} ㆍ 대응 의상</span>}</div>
  </div>
}

import { useEffect, useRef, useState } from 'react'
import { multiplyPose, extraLocal } from '../../utils/shopMotion'
import { effectAnimation } from '../../utils/shopEffect'
import usePreviewInteraction from './usePreviewInteraction'
import { ornamentPlacement, particleBatches, particleSystem } from '../../utils/shopParticles'

const modelCache = new Map()
const motionCache = new Map()
async function motionData(url) {
  if (!motionCache.has(url)) {
    if (motionCache.size >= 8) motionCache.delete(motionCache.keys().next().value)
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

export default function ShopViewer({ meta, sex, slots, counterparts, pair, angle, zoom, motion = null, couplePreview = null, audioContext = null, audioReady = null, selectedSex = sex, panX = 0, panY = 0, mode = 'rotate', onViewChange, onReady, onFailure, partnerSex,disposeContext=false }) {
  const otherSex=partnerSex||(sex==='male'?'female':'male')
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  usePreviewInteraction(canvasRef, angle, zoom, panX, panY, mode, onViewChange)
  const [status, setStatus] = useState('3D 모델을 준비 중입니다.')
  const callbacks=useRef({onReady,onFailure});callbacks.current={onReady,onFailure}
  const [failed, setFailed] = useState(false)
  const [primaryOnLeft,setPrimaryOnLeft]=useState(true)
  useEffect(() => {
    let cancelled = false
    const resources = []
    let context
    const abort = new AbortController()
    const canvas = canvasRef.current
    setStatus('3D 모델을 준비 중입니다.')
    setFailed(false)
    rendererRef.current = null
    async function load() {
      const gl = canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true })
      context=gl
      if (!gl) throw new Error('이 브라우저는 3D 미리보기를 지원하지 않습니다.')
      const sources = [meta.bases[sex], ...Object.values(slots).filter(Boolean).map(item => item.model)]
      if (pair) sources.push(meta.bases[otherSex], ...Object.values(counterparts).filter(Boolean).map(item => item.model))
      const effectSpecs = [...(motion?.effects || []).filter(effect => effect.model !== couplePreview?.ornament?.model).map(effect => ({ ...effect, kind: 'scene' })), ...(couplePreview?.ornament ? [{ ...couplePreview.ornament, kind: 'ornament' }] : [])]
      sources.push(...effectSpecs.map(effect => effect.model))
      const models = Object.fromEntries(await Promise.all([...new Set(sources)].map(async url => [url, await model(url)])))
      if (cancelled) return
      let clip, binding, buffer, startedAt = Infinity
      if (motion) {
        const [data, bindings, response] = await Promise.all([motionData(motion.motion), motionData(motion.bindings), fetch(motion.audio, { credentials: 'same-origin', cache: 'force-cache', signal: abort.signal })])
        if (!response.ok || data.schema !== 'shop-couple-motion-v1' || bindings.schema !== data.schema || !Number.isInteger(data.frame_count) || data.frame_count < 2 || data.frame_count > 5400) throw new Error('커플 미리보기 자료가 올바르지 않습니다.')
        clip = { ...data, actors: {} }; binding = bindings.bindings || {}
        for (const gender of data.actors?.a&&data.actors?.b?['a','b']:['male','female']) {
          const actualSex=gender==='a'?sex:gender==='b'?otherSex:gender
          if(data.actor_sexes&&data.actor_sexes[gender]!==actualSex)throw new Error('캐릭터 성별과 모션이 일치하지 않습니다.')
          if (data.bases && data.bases[actualSex] !== meta.bases[actualSex].split('/').at(-1)) throw new Error('캐릭터 자세 자료를 갱신 중입니다. 잠시 후 다시 열어주세요.')
          const actor = data.actors?.[gender]
          if (!Array.isArray(actor?.bones) || !actor.bones.length || actor.bones.length > 100 || actor.frames?.length !== data.frame_count * actor.bones.length * 16 || !actor.frames.every(Number.isFinite)) throw new Error('커플 동작 자료가 올바르지 않습니다.')
          const extras = {}
          for (const [name, track] of Object.entries(actor.extras || {})) {
            if (track.frames?.length !== data.frame_count * 16 || !track.frames.every(Number.isFinite)) throw new Error('의상 동작 자료가 올바르지 않습니다.')
            extras[name] = { ...track, frames: new Float32Array(track.frames) }
          }
          if (actor.side != null && !['left', 'right'].includes(actor.side)) throw new Error('커플 배우 배치 자료가 올바르지 않습니다.')
          clip.actors[gender] = { bones: actor.bones, frames: new Float32Array(actor.frames), extras, side: actor.side }
        }
        if ((clip.actors.a||clip.actors.male).side && (clip.actors.a||clip.actors.male).side === (clip.actors.b||clip.actors.female).side) throw new Error('커플 배우 배치 자료가 올바르지 않습니다.')
        if (!audioContext) throw new Error('이 브라우저에서 소리를 재생할 수 없습니다.')
        if (!await audioReady) throw new Error('소리를 시작하지 못했습니다. 창을 닫고 다시 열어주세요.')
        buffer = await audioContext.decodeAudioData(await response.arrayBuffer())
        if (audioContext.state !== 'running') throw new Error('소리를 시작하지 못했습니다. 창을 닫고 다시 열어주세요.')
      }
      if (cancelled) return
      const effects = await Promise.all(effectSpecs.map(async effect => ({ ...effect, data: effectAnimation(await motionData(effect.animation), models[effect.model].meshes, effect.kind === 'scene' ? clip?.frame_count : null) })))
      await Promise.all(effects.map(async effect => { if (effect.particles) effect.particleData = particleSystem(await motionData(effect.particles), effect.data.frame_count) }))
      if (cancelled) return
      setPrimaryOnLeft(!clip||(clip.actors.a||clip.actors[sex]).side!=='right')
      const ornament = effects.find(effect => effect.kind === 'ornament')
      const sceneEffects = effects.filter(effect => effect.kind === 'scene')
      const ornamentPose = ornament ? ornamentPlacement(ornament.data.bounds) : null
      canvas.dataset.coupleSceneModels = String(sceneEffects.length)
      canvas.dataset.coupleOrnament = ornament ? '1' : '0'
      canvas.dataset.coupleModelPlacement = ornament ? 'main' : 'none'
      const previewStartedAt = performance.now()
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
        attribute vec4 color;
        uniform float angle,aspect,halfHeight,halfDepth,centerX,centerY,centerZ,offsetX,worldOffsets,panX,panY;
        uniform mat4 attachmentPose;
        varying vec2 texcoord;
        varying float lighting;
        varying vec4 tint;
        void main(){
          float c=cos(angle),s=sin(angle);
          vec3 p=(attachmentPose*vec4(position,1.)).xyz-vec3(0.,148.,0.);
          p.x+=offsetX*worldOffsets;
          vec3 posedNormal=mat3(attachmentPose)*normal;
          vec3 q=vec3(-c*p.x-s*p.z+offsetX*(1.-worldOffsets),p.y,-s*p.x+c*p.z);
          vec3 n=vec3(-c*posedNormal.x-s*posedNormal.z,posedNormal.y,-s*posedNormal.x+c*posedNormal.z);
          gl_Position=vec4((q.x-centerX)/(halfHeight*aspect)+panX,(q.y-centerY)/halfHeight+panY,-(q.z-centerZ)/halfDepth,1.);
          texcoord=uv;
          tint=color;
          lighting=.76+.24*max(dot(normalize(n),normalize(vec3(-.35,.65,1.))),0.);
        }
      `))
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `precision mediump float;uniform sampler2D map;uniform float effect,particleAdditive;varying vec2 texcoord;varying float lighting;varying vec4 tint;void main(){vec4 t=texture2D(map,texcoord)*tint;if(t.a<(effect>1.5?.005:effect>.5?.03:.43))discard;float a=t.a*(particleAdditive>.5?max(t.r,max(t.g,t.b)):1.);gl_FragColor=effect>1.5?vec4(t.rgb*t.a,a):effect>.5?t:vec4(t.rgb*lighting,1.);}`))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('3D 화면 초기화에 실패했습니다.')
      gl.useProgram(program); gl.enable(gl.DEPTH_TEST)
      const attrs = Object.fromEntries(['position', 'normal', 'uv', 'color'].map(key => [key, gl.getAttribLocation(program, key)]))
      const uniforms = Object.fromEntries(['angle', 'aspect', 'halfHeight', 'halfDepth', 'centerX', 'centerY', 'centerZ', 'offsetX', 'attachmentPose', 'effect', 'particleAdditive', 'worldOffsets', 'panX', 'panY'].map(key => [key, gl.getUniformLocation(program, key)]))
      gl.uniform1f(uniforms.worldOffsets, clip ? 1 : 0)
      const textures = {}
      function textureUrl(payload, mesh) {
        const revision = payload.texture_revision || meta.texture_revision || meta.revision
        if (!/^[a-f0-9]{12,64}$/.test(revision) || !/^[a-f0-9]{64}\.webp$/.test(mesh.texture)) throw new Error('텍스처 자료가 올바르지 않습니다.')
        return `/api/shop/assets/${revision}/textures/${mesh.texture}`
      }
      const textureNames = [...new Set([...Object.values(models).flatMap(payload => payload.meshes.map(mesh => textureUrl(payload, mesh))), ...effects.flatMap(effect => effect.particleData ? effect.particleData.emitters.map(emitter => textureUrl(effect.particleData, emitter)) : [])])]
      await Promise.all(textureNames.map(async name => {
        const response = await fetch(name, { credentials: 'same-origin', cache: 'force-cache' })
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
        return { name: mesh.name, modelKey: url.split('/').at(-1), vb, ib, count: mesh.indices.length, texture: textures[textureUrl(payload, mesh)], bounds, blend: mesh.blend === true }
      })]))
      function figure(gender, chosen, frame = 0,actorKey=gender) {
        const result = new Map(gpu[meta.bases[gender]].map(mesh => [mesh.name, mesh]))
        Object.entries(chosen).filter(([slot, item]) => slot !== 'pet' && item).forEach(([, item]) => gpu[item.model].forEach(mesh => result.set(mesh.name, mesh)))
        const pose = models[meta.bases[gender]].attachment_pose
        if (pose && (pose.length !== 16 || !pose.every(Number.isFinite))) throw new Error('캐릭터 자세 자료가 올바르지 않습니다.')
        return [...result.values()].map(mesh => {
          const anchor = pose && mesh.name.startsWith('Summon-') ? pose : null
          if (!clip) return anchor ? { ...mesh, pose: anchor, bounds: posedBounds(mesh.bounds, anchor) } : mesh
          const actor = clip.actors[actorKey]
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
      function effectMeshes(effect, frame) {
        return gpu[effect.model].map(mesh => {
          const original = effect.data.tracks.get(mesh.name).subarray(frame * 16, frame * 16 + 16)
          const pose = effect.kind === 'ornament' ? multiplyPose(original, ornamentPose) : original
          return { ...mesh, pose, bounds: posedBounds(mesh.bounds, pose) }
        })
      }
      function paint(meshes, offset, effect = false) {
        gl.uniform1f(uniforms.offsetX, offset)
        gl.uniform1f(uniforms.effect, effect ? 1 : 0)
        gl.disableVertexAttribArray(attrs.color); gl.vertexAttrib4f(attrs.color, 1, 1, 1, 1)
        for (const mesh of meshes) {
          if (effect && mesh.blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false) }
          gl.uniformMatrix4fv(uniforms.attachmentPose, false, mesh.pose || identityPose)
          gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb)
          for (const [key, size, byte] of [['position', 3, 0], ['normal', 3, 12], ['uv', 2, 24]]) { gl.enableVertexAttribArray(attrs[key]); gl.vertexAttribPointer(attrs[key], size, gl.FLOAT, false, 32, byte) }
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.bindTexture(gl.TEXTURE_2D, mesh.texture)
          gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0)
          if (effect && mesh.blend) { gl.disable(gl.BLEND); gl.depthMask(true) }
        }
      }
      const particleBuffer = effects.some(effect => effect.particleData) ? gl.createBuffer() : null
      if (particleBuffer) {
        resources.push(() => gl.deleteBuffer(particleBuffer))
        gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer); gl.bufferData(gl.ARRAY_BUFFER, 512 * 6 * 36, gl.DYNAMIC_DRAW)
      }
      function paintParticles(effect, elapsed, period, radians, offset, budget) {
        if (!effect.particleData || !particleBuffer) return 0
        const batches = particleBatches(effect.particleData, elapsed, period, radians, effect.kind === 'ornament' ? ornamentPose : null, budget)
        gl.uniform1f(uniforms.effect, 2); gl.uniform1f(uniforms.offsetX, offset)
        gl.uniformMatrix4fv(uniforms.attachmentPose, false, identityPose)
        gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer)
        gl.disableVertexAttribArray(attrs.normal); gl.vertexAttrib3f(attrs.normal, 0, 0, 1)
        for (const [key, size, byte] of [['position', 3, 0], ['uv', 2, 12], ['color', 4, 20]]) { gl.enableVertexAttribArray(attrs[key]); gl.vertexAttribPointer(attrs[key], size, gl.FLOAT, false, 36, byte) }
        gl.enable(gl.BLEND); gl.depthMask(false)
        let count = 0
        for (const batch of batches) {
          gl.uniform1f(uniforms.particleAdditive, batch.additive ? 1 : 0)
          gl.blendFuncSeparate(gl.ONE, batch.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
          gl.bindTexture(gl.TEXTURE_2D, textures[textureUrl(effect.particleData, batch)])
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.vertices); gl.drawArrays(gl.TRIANGLES, 0, batch.vertices.length / 9)
          count += batch.vertices.length / 54
        }
        gl.disable(gl.BLEND); gl.depthMask(true)
        return count
      }
      let cachedFrame = -1, cachedPrimary, cachedSecondary, poseBuilds = 0
      let envelopes, previousFrame = -1, previousRotation, previousScale, previousPanX, previousPanY
      rendererRef.current = (rotation, scale, offsetX = 0, offsetY = 0) => {
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
        const elapsed = clip ? Math.max(0, audioContext.currentTime - startedAt) : (performance.now() - previewStartedAt) / 1000
        const frame = clip ? Math.min(clip.frame_count - 1, Math.floor(elapsed % buffer.duration / buffer.duration * clip.frame_count)) : 0
        const ornamentDuration = ornament ? (clip ? buffer.duration : couplePreview.duration) * (ornament.data.relative_duration || 1) : 1
        const ornamentFrame = ornament ? Math.floor(elapsed % ornamentDuration / ornamentDuration * ornament.data.frame_count) : 0
        const particleFrame = particleBuffer ? Math.floor(elapsed * 30) : 0
        const activeFrame = `${frame}:${ornamentFrame}:${particleFrame}`
        if ((clip || ornament) && activeFrame === previousFrame && rotation === previousRotation && scale === previousScale && offsetX === previousPanX && offsetY === previousPanY && !resized) return
        previousFrame = activeFrame; previousRotation = rotation; previousScale = scale; previousPanX = offsetX; previousPanY = offsetY
        if (clip) canvas.dataset.motionFrame = String(frame)
        if (cachedFrame !== frame) { cachedFrame = frame; cachedPrimary = figure(sex, slots, frame,clip?.actors.a?'a':sex); cachedSecondary = pair ? figure(otherSex, counterparts, frame,clip?.actors.b?'b':otherSex) : null; canvas.dataset.poseBuilds = String(++poseBuilds) }
        const primary = cachedPrimary, secondary = cachedSecondary
        const hasAttachments = !!(slots.accessory || slots.summon || pair && (counterparts.accessory || counterparts.summon))
        const spacing = pair && hasAttachments && !clip ? Math.max(65, (horizontalBounds(primary)[1] - horizontalBounds(secondary)[0] + 20) / 2) : 65
        const primaryOffset=clip?(sex==='male'?-65:65):pair?-spacing:0,secondaryOffset=clip?(otherSex==='male'?-65:65):spacing
        const scene = [{ meshes: primary, offset: primaryOffset }]
        if (pair) scene.push({ meshes: secondary, offset: secondaryOffset })
        for (const effect of sceneEffects) scene.push({ meshes: effectMeshes(effect, frame), offset: effect.sex === sex ? primaryOffset : secondaryOffset, effect: true })
        if (ornament) scene.push({ meshes: effectMeshes(ornament, ornamentFrame), offset: 0, effect: true })
        if (clip && !envelopes) {
          envelopes = [[sex, slots, primaryOffset,clip.actors.a?'a':sex], [otherSex, counterparts, secondaryOffset,clip.actors.b?'b':otherSex]].map(([gender, chosen, offset,actorKey]) => {
            const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]]
            for (let sample = 0; sample < clip.frame_count; sample++) for (const mesh of figure(gender, chosen, sample,actorKey)) for (let axis = 0; axis < 3; axis++) { bounds[0][axis] = Math.min(bounds[0][axis], mesh.bounds[0][axis]); bounds[1][axis] = Math.max(bounds[1][axis], mesh.bounds[1][axis]) }
            return { bounds, offset }
          })
          for (const effect of sceneEffects) envelopes.push({ bounds: effect.data.bounds, offset: effect.sex === sex ? primaryOffset : secondaryOffset })
          canvas.dataset.envelopeBuilds = '1'
        }
        const envelope = envelopes ? [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]] : null
        for (const group of envelopes || []) for (const x of group.bounds.map(v => v[0])) for (const y of group.bounds.map(v => v[1])) for (const z of group.bounds.map(v => v[2])) {
          const point = [-c * x - s * z + (clip ? -c * group.offset : group.offset), y - 148, -s * x + c * z - (clip ? s * group.offset : 0)]
          for (let axis = 0; axis < 3; axis++) { envelope[0][axis] = Math.min(envelope[0][axis], point[axis]); envelope[1][axis] = Math.max(envelope[1][axis], point[axis]) }
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
        if (ornament) {
          const framing = posedBounds(ornament.data.bounds, ornamentPose)
          framing[1][1] += effects.some(effect => effect.particleData) ? 80 : 0
          for (const x of [framing[0][0], framing[1][0]]) for (const y of [framing[0][1], framing[1][1]]) for (const z of [framing[0][2], framing[1][2]]) {
            const point = [-c * x - s * z, y - 148, -s * x + c * z]
            for (let axis = 0; axis < 3; axis++) { bounds[0][axis] = Math.min(bounds[0][axis], point[axis]); bounds[1][axis] = Math.max(bounds[1][axis], point[axis]) }
          }
        }
        for (const group of scene) for (const mesh of group.meshes) {
          for (const x of [mesh.bounds[0][0], mesh.bounds[1][0]]) for (const y of [mesh.bounds[0][1], mesh.bounds[1][1]]) for (const z of [mesh.bounds[0][2], mesh.bounds[1][2]]) {
            const point = [-c * x - s * z + (clip ? -c * group.offset : group.offset), y - 148, -s * x + c * z - (clip ? s * group.offset : 0)]
            for (let axis = 0; axis < 3; axis++) { bounds[0][axis] = Math.min(bounds[0][axis], point[axis]); bounds[1][axis] = Math.max(bounds[1][axis], point[axis]) }
          }
        }
        gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        gl.uniform1f(uniforms.angle, radians); gl.uniform1f(uniforms.aspect, aspect)
        const halfHeight = Math.max((bounds[1][1] - bounds[0][1]) / 2, (bounds[1][0] - bounds[0][0]) / (2 * aspect), 1) * 1.12 * 100 / scale
        for (const [axis, key] of ['centerX', 'centerY', 'centerZ'].entries()) gl.uniform1f(uniforms[key], (bounds[0][axis] + bounds[1][axis]) / 2 + (axis === 1 && couplePreview ? halfHeight * .02 : 0))
        canvas.dataset.viewAngle = String(rotation); canvas.dataset.viewZoom = String(scale)
        gl.uniform1f(uniforms.panX, offsetX / 50); gl.uniform1f(uniforms.panY, -offsetY / 50)
        canvas.dataset.viewPanX = String(offsetX); canvas.dataset.viewPanY = String(offsetY)
        gl.uniform1f(uniforms.halfHeight, halfHeight)
        gl.uniform1f(uniforms.halfDepth, Math.max(500, (bounds[1][2] - bounds[0][2]) / 2 + 10))
        const labelPositions = []
        for (const [index, group] of scene.slice(0, pair ? 2 : 1).entries()) {
          const gender = index ? (sex === 'male' ? 'female' : 'male') : sex
          const side = clip?.actors[gender].side
          const labelOffset = side ? -c * (side === 'left' ? -65 : 65) : group.offset
          const position = 50 + (labelOffset - (bounds[0][0] + bounds[1][0]) / 2) / (halfHeight * aspect) * 50
          labelPositions.push(Math.min(88, Math.max(12, position)))
        }
        if (labelPositions.length === 2) {
          const gap = Math.min(170 / rect.width * 100, 45), middle = Math.min(88 - gap / 2, Math.max(12 + gap / 2, (labelPositions[0] + labelPositions[1]) / 2))
          if (Math.abs(labelPositions[0] - labelPositions[1]) < gap) { const direction = labelPositions[0] <= labelPositions[1] ? -1 : 1; labelPositions[0] = middle + direction * gap / 2; labelPositions[1] = middle - direction * gap / 2 }
        }
        labelPositions.forEach((position, index) => canvas.parentElement.style.setProperty(index ? '--shop-secondary-label' : '--shop-primary-label', `${position}%`))
        for (const group of scene) paint(group.meshes, group.offset, group.effect)
        if (ornament) canvas.dataset.ornamentFrame = String(ornamentFrame)
        const particleGroups = effects.filter(effect => effect.particleData)
        let particleCount = 0
        for (const effect of particleGroups) particleCount += paintParticles(effect, elapsed, effect.kind === 'ornament' ? ornamentDuration : buffer.duration, radians, effect.kind === 'ornament' ? 0 : effect.sex === sex ? primaryOffset : secondaryOffset, Math.floor(320 / particleGroups.length))
        canvas.dataset.particleCount = String(particleCount)
        if (particleBuffer) canvas.dataset.particleFrame = String(particleFrame)
      }
      if (clip) {
        rendererRef.current(angle, zoom, panX, panY)
        const source = audioContext.createBufferSource(), gain = audioContext.createGain()
        source.buffer = buffer; source.loop = true; gain.gain.value = .7
        source.connect(gain); gain.connect(audioContext.destination)
        resources.push(() => { try { source.stop() } catch {} source.disconnect(); gain.disconnect() })
        startedAt = audioContext.currentTime + .05; source.start(startedAt)
      }
      setStatus('')
    }
    load().catch(error => { if (!cancelled) { setStatus(error.message); setFailed(true);callbacks.current.onFailure?.(error) } })
    return () => { cancelled = true; abort.abort(); rendererRef.current = null; resources.forEach(dispose => dispose());if(disposeContext)requestAnimationFrame(()=>{if(!canvas.isConnected)context?.getExtension('WEBGL_lose_context')?.loseContext()}) }
  }, [meta, sex, otherSex,slots, counterparts, pair, motion, couplePreview, audioContext, audioReady])
  useEffect(() => {
    const draw = () => rendererRef.current?.(angle, zoom, panX, panY)
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvasRef.current)
    let frame
    if ((motion || couplePreview?.ornament) && !status) {
      const tick = () => { draw(); frame = requestAnimationFrame(tick) }
      frame = requestAnimationFrame(tick)
    }
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [angle, zoom, panX, panY, status, motion, couplePreview])
  useEffect(()=>{if(status)return;const frame=requestAnimationFrame(()=>callbacks.current.onReady?.(canvasRef.current));return()=>cancelAnimationFrame(frame)},[status])
  return <div className="shop-stage">
    <canvas ref={canvasRef} tabIndex={0} data-view-mode={mode} role="img" aria-label={pair ? '두 캐릭터의 전신 의상 미리보기' : '선택한 아이템을 착용한 전신 캐릭터'} />
    <div className="shop-stage-status" role={failed ? 'alert' : 'status'}>{status}</div>
    <div className="shop-character-labels">{(pair&&!primaryOnLeft?[{sex:otherSex,primary:false},{sex,primary:true}]:[{sex,primary:true},...(pair?[{sex:otherSex,primary:false}]:[])]).map(actor=><span key={actor.primary?'primary':'partner'} data-actor={actor.primary?'primary':'partner'}>{actor.sex==='male'?'남성':'여성'} ㆍ {actor.primary&&sex===selectedSex?'선택한 의상':'대응 의상'}</span>)}</div>
  </div>
}

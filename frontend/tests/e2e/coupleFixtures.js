import {setup,root,hero,shirt,femaleShirt,pet,mesh} from './shopFixtures.js'
export const coupleRoot = `${root}/motions/`
export const coupleRing = { ...hero, id: '30120', name: '하트 주얼링', category: '507', group: 'couple', couple_preview: { motion: coupleRoot + '1'.repeat(64) + '.json.gz', bindings: coupleRoot + '2'.repeat(64) + '.json.gz', audio: `${root}/audio/${'3'.repeat(64)}.mp3`, duration: .5 } }
export const missingCoupleRing = { ...coupleRing, id: '30845', name: '흐르는 등불(공용)', couple_preview: null }
export async function coupleFixture(page, { motionGate, actorRoles = true, effects = false, effectGate, ornamentCycle = 1, sharedEffectModel = false, particles = false, particleGate, blackParticles = false, sameSex=false,characters,extraItems=[],loggedIn=true } = {}) {
  effects ||= particles
  const effectDescriptor = (model, animation) => ({ model: `${root}/models/${model.repeat(64)}.json.gz`, animation: coupleRoot + animation.repeat(64) + '.json.gz', ...(particles && model === '4' ? { particles: coupleRoot + 'a'.repeat(64) + '.json.gz' } : {}) })
  const baseRing=sameSex?{...coupleRing,id:'30854',name:'스타라이트 완드',couple_preview:{...coupleRing.couple_preview,same_sex_motions:{female:coupleRoot+'c'.repeat(64)+'.json.gz',male:coupleRoot+'d'.repeat(64)+'.json.gz'}}}:coupleRing
  const ring = effects ? { ...baseRing, couple_preview: { ...baseRing.couple_preview, ornament: effectDescriptor('4', '5'), effects: [{ ...effectDescriptor(sharedEffectModel ? '4' : '6', '7'), sex: 'male' }] } } : baseRing
  const requests = await setup(page, { characters,loggedIn,items: [shirt, { ...femaleShirt, counterpart_id: '200' }, pet, { ...pet, id: '400', slot: 'accessory', model: `${root}/models/${'8'.repeat(64)}.json.gz` }, { ...pet, id: '500', slot: 'summon', model: `${root}/models/${'9'.repeat(64)}.json.gz` }, ring, missingCoupleRing,...extraItems] })
  const wave = Buffer.alloc(44 + 22050 * 2)
  wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(44100, 24); wave.writeUInt32LE(88200, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40)
  const matrices = Array.from({ length: 15 }, (_, frame) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Math.sin(frame * Math.PI * 2 / 15) * 15, 0, 0, 1]).flat()
  const actor = gender => ({ bones: ['Waist'], frames: matrices.map((value, index) => actorRoles && index % 16 === 12 ? value + (gender === 'male' ? 130 : -130) : value), ...(actorRoles ? { side: gender === 'male' ? 'right' : 'left' } : {}) })
  await page.route('**/api/shop/assets/*/motions/*', async route => {
    if (effects && ['5', '7'].some(digit => route.request().url().includes(digit.repeat(64)))) {
      if (effectGate) await effectGate
      const cycle = route.request().url().includes('5'.repeat(64)) ? ornamentCycle : 1
      return route.fulfill({ json: { schema: 'shop-couple-effect-v1', frame_count: 15 * cycle, relative_duration: cycle, bounds: [[-30, 0, -30], [30, 280, 30]], meshes: [{ name: 'Waist', frames: Array.from({ length: cycle }, () => matrices).flat() }] } })
    }
    if (motionGate) await motionGate
    if(sameSex&&['c','d'].some(d=>route.request().url().includes(d.repeat(64)))){const sex=route.request().url().includes('c'.repeat(64))?'female':'male';const first=actor(sex),second={...actor(sex),side:sex==='male'?'left':'right',frames:matrices};return route.fulfill({json:{schema:'shop-couple-motion-v1',frame_count:15,duration:.5,actor_sexes:{a:sex,b:sex},actors:{a:first,b:second}}})}
    const bindings = route.request().url().includes('2'.repeat(64))
    return route.fulfill({ json: bindings ? { schema: 'shop-couple-motion-v1', bindings: {} } : { schema: 'shop-couple-motion-v1', frame_count: 15, duration: .5, actors: { male: actor('male'), female: actor('female') } } })
  })
  if (effects) for (const digit of ['4', '6']) await page.route(`**/models/${digit.repeat(64)}.json.gz`, route => route.fulfill({ json: { ...mesh, texture_revision: 'f'.repeat(20) } }))
  if (particles) {
    await page.route(`**/motions/${'a'.repeat(64)}.json.gz`, async route => {
      if (particleGate) await particleGate
      return route.fulfill({ json: { schema: 'shop-particles-v1', texture_revision: 'f'.repeat(20), frame_count: 15 * ornamentCycle, source_duration: 15, anchors: { '': Array.from({ length: ornamentCycle }, () => matrices).flat() }, emitters: [{ anchor: '', texture: '9'.repeat(64) + '.webp', format: 'binary-v3', count: 8, interval: .1, seed: 42, start_tick: 0, end_tick: 0, midpoint: .5, uv_fps: 10, lifetime: [50, 50], velocity: [0, 0], position: [0, 0, -2], attachment_position: [0, 0, 0], attachment_rotation: [0, 0, 0], min_position: [0, 0, 0], max_position: [0, 0, 0], position_scale: [1, 1, 1], min_direction: [0, 0, 0], max_direction: [0, 0, 0], gravity: [0, 0, 0], acceleration: [0, 0, 0], colors: Array.from({ length: 3 }, () => [1, 1, 1, 1]), sizes: Array.from({ length: 3 }, () => [.25, .25, .25, .25]), uv: [[0, 0, 1, 1]], additive: true, angular_velocity: 0 }] } })
    })
    const black = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGNkYGD4z8DAwMAEIkAYAA4oAQOSwUJsAAAAAElFTkSuQmCC', 'base64')
    await page.route(`**/textures/${'9'.repeat(64)}.webp`, route => route.fulfill({ body: blackParticles ? black : png, contentType: 'image/png' }))
  }
  await page.route('**/api/shop/assets/*/audio/*', route => route.fulfill({ body: wave, contentType: 'audio/mpeg' }))
  await page.addInitScript(() => {
    const Native = window.AudioContext
    window.__coupleAudio = []
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args)
        const record = { context: this, starts: 0, stops: 0, loop: false }
        window.__coupleAudio.push(record)
        const original = this.createBufferSource.bind(this)
        this.createBufferSource = () => {
          const node = original(), start = node.start.bind(node), stop = node.stop.bind(node)
          node.start = (...values) => { record.starts++; record.loop = node.loop; return start(...values) }
          node.stop = (...values) => { record.stops++; return stop(...values) }
          return node
        }
      }
    }
  })
  return requests
}

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canPreviewItem } from '../src/utils/shopPreview.js'

test('couple capability is separate from wearable selection and unsupported assets', () => {
  assert.equal(canPreviewItem({ preview_available: true, model: '/model' }), true)
  assert.equal(canPreviewItem({ preview_available: false, model: null, couple_preview: { motion: '/motion', audio: '/audio' } }), true)
  assert.equal(canPreviewItem({ preview_available: false, model: null, couple_preview: null }), false)
  assert.equal(canPreviewItem({ couple_preview: { motion: '/motion' } }), false)
  assert.equal(canPreviewItem(null), false)
})

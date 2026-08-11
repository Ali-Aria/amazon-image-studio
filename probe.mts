import { computeSlotSafeBox, getRetailOccludedCanvasBox, subjectOcclusionArea } from './src/lib/retailSafeBox'
import { getRetailGenerationSize } from './src/lib/retailPlatform'
import { RETAIL_SLOT_IDS } from './src/lib/retailPlanner'
for (const preset of ['meituan-square', 'meituan-landscape']) {
  console.log('###', preset)
  for (const slot of RETAIL_SLOT_IDS) {
    const gs = getRetailGenerationSize(preset, slot)
    const sb = computeSlotSafeBox(preset, slot, gs)
    const occ = getRetailOccludedCanvasBox(preset, slot)
    console.log(slot, gs, JSON.stringify(sb), occ ? `occ x[${(occ.x0*100).toFixed(3)},${(occ.x1*100).toFixed(3)}] y[${(occ.y0*100).toFixed(3)},${(occ.y1*100).toFixed(3)}]` : 'occ none', 'overlap', subjectOcclusionArea(preset, slot).toFixed(6))
  }
}
